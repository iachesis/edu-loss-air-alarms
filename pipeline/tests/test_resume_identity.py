from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.acquisition import git_blob_sha1_file
from aae_pipeline.local_runner import run_local_build
from aae_pipeline.utils import read_json, sha256_file, utc_now_iso, write_json
from support import make_test_project


class ResumeIdentityTests(unittest.TestCase):
    def resolution(self, source: Path, commit: str):
        return {
            "configured_source_url": "https://example.invalid/main/source.csv",
            "repository_owner": "owner",
            "repository_name": "repo",
            "repository_path": "source.csv",
            "repository_branch": "main",
            "resolved_upstream_commit_sha": commit,
            "upstream_git_blob_sha1": git_blob_sha1_file(source),
            "expected_resolved_byte_size": source.stat().st_size,
            "immutable_resolved_raw_url": f"https://example.invalid/{commit}/source.csv",
            "resolved_at_utc": utc_now_iso(),
        }

    def acquire(self, source: Path, resolution: dict, cache_dir: Path):
        target = cache_dir / "sha256" / f"{sha256_file(source)}.csv"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        return target, {
            "source_mode": "live_resolved_source",
            **resolution,
            "retrieval_started_at_utc": utc_now_iso(),
            "retrieval_completed_at_utc": utc_now_iso(),
            "http_content_length_declared": source.stat().st_size,
            "actual_bytes_received": source.stat().st_size,
            "sha256": sha256_file(source),
            "recomputed_git_blob_sha1": git_blob_sha1_file(source),
            "content_addressed_filename": target.name,
        }

    def first_live_build(self, temp: Path):
        project, source = make_test_project(temp)
        output = temp / "output/full"
        resolution = self.resolution(source, "a" * 40)
        with patch("aae_pipeline.local_runner.resolve_github_source", return_value=resolution), patch(
            "aae_pipeline.local_runner.acquire_resolved_github_source",
            side_effect=lambda resolved, cache: self.acquire(source, resolved, cache),
        ):
            state = run_local_build(
                root=project,
                output_dir=output,
                school_years=["2024_2025"],
                oblast_ids=["UA12"],
                fresh=True,
            )
        return project, source, output, resolution, state

    def test_same_identity_interrupted_build_resumes_immutable_source(self):
        with tempfile.TemporaryDirectory() as temp:
            project, _source, output, resolution, _state = self.first_live_build(Path(temp))
            state_path = output / "state/build_state.json"
            interrupted = read_json(state_path)
            interrupted["status"] = "PARTIAL"
            interrupted.pop("final_build_id", None)
            write_json(state_path, interrupted)
            with patch("aae_pipeline.local_runner.resolve_github_source", return_value=resolution), patch(
                "aae_pipeline.local_runner.acquire_resolved_github_source",
                side_effect=AssertionError("same-identity resume must reuse the verified immutable cache"),
            ):
                resumed = run_local_build(
                    root=project,
                    output_dir=output,
                    school_years=["2024_2025"],
                    oblast_ids=["UA12"],
                    fresh=False,
                    resume=True,
                )
            self.assertEqual(resumed["source_provenance"]["source_mode"], "resumed_immutable_source")

    def test_changed_upstream_after_completed_build_requires_clean_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            project, source, output, _resolution, original = self.first_live_build(Path(temp))
            changed = self.resolution(source, "b" * 40)
            with patch("aae_pipeline.local_runner.resolve_github_source", return_value=changed), patch(
                "aae_pipeline.local_runner.acquire_resolved_github_source",
                side_effect=lambda resolved, cache: self.acquire(source, resolved, cache),
            ):
                with self.assertRaisesRegex(RuntimeError, "Start a clean build"):
                    run_local_build(
                        root=project,
                        output_dir=output,
                        school_years=["2024_2025"],
                        oblast_ids=["UA12"],
                        fresh=False,
                        resume=True,
                    )
                refreshed = run_local_build(
                    root=project,
                    output_dir=output,
                    school_years=["2024_2025"],
                    oblast_ids=["UA12"],
                    fresh=True,
                    resume=True,
                )
            self.assertEqual(
                refreshed["source_provenance"]["resolved_upstream_commit_sha"],
                "b" * 40,
            )
            self.assertNotEqual(refreshed["final_build_id"], original["final_build_id"])

    def test_same_upstream_after_completed_build_also_requires_fresh_run(self):
        with tempfile.TemporaryDirectory() as temp:
            project, _source, output, resolution, _state = self.first_live_build(Path(temp))
            with patch("aae_pipeline.local_runner.resolve_github_source", return_value=resolution):
                with self.assertRaisesRegex(RuntimeError, "completed build is not resumable"):
                    run_local_build(
                        root=project,
                        output_dir=output,
                        school_years=["2024_2025"],
                        oblast_ids=["UA12"],
                        fresh=False,
                        resume=True,
                    )

    def test_changed_upstream_during_partial_checkpoint_requires_clean_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            project, source, output, _resolution, _state = self.first_live_build(Path(temp))
            state_path = output / "state/build_state.json"
            partial = read_json(state_path)
            partial["status"] = "PARTIAL"
            write_json(state_path, partial)
            changed = self.resolution(source, "c" * 40)
            with patch("aae_pipeline.local_runner.resolve_github_source", return_value=changed), patch(
                "aae_pipeline.local_runner.acquire_resolved_github_source",
                side_effect=lambda resolved, cache: self.acquire(source, resolved, cache),
            ):
                with self.assertRaisesRegex(RuntimeError, "different source commit/blob/SHA-256"):
                    run_local_build(
                        root=project,
                        output_dir=output,
                        school_years=["2024_2025"],
                        oblast_ids=["UA12"],
                        fresh=False,
                        resume=True,
                    )

    def test_explicit_pinned_local_source_records_distinct_mode(self):
        with tempfile.TemporaryDirectory() as temp:
            project, source = make_test_project(Path(temp))
            state = run_local_build(
                root=project,
                output_dir=Path(temp) / "output/full",
                alarm_source=source,
                alarm_source_sha256=sha256_file(source),
                school_years=["2024_2025"],
                oblast_ids=["UA12"],
                fresh=True,
            )
            self.assertEqual(state["source_provenance"]["source_mode"], "explicit_pinned_local_source")
            self.assertIsNone(state["source_provenance"]["retrieval_started_at_utc"])


if __name__ == "__main__":
    unittest.main()
