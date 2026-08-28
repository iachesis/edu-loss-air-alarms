from __future__ import annotations

import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.acquisition import download_verified_source, resolve_github_source


class FakeResponse:
    def __init__(self, body: bytes, *, status: int = 200, headers: dict[str, str] | None = None):
        self.stream = io.BytesIO(body)
        self.status = status
        self.headers = headers or {}

    def read(self, size: int = -1) -> bytes:
        return self.stream.read(size)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()


class AcquisitionHardeningTests(unittest.TestCase):
    def setUp(self):
        self.good = b"a,b\n1,2\n"

    def assert_rejected_and_preserved(self, *, response: FakeResponse, **expectations):
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / "source.csv"
            destination.write_bytes(b"previous-known-good")
            with self.assertRaises(Exception):
                download_verified_source(
                    "https://example.invalid/source.csv",
                    destination,
                    urlopen=lambda *_args, **_kwargs: response,
                    **expectations,
                )
            self.assertEqual(destination.read_bytes(), b"previous-known-good")
            self.assertEqual(list(destination.parent.glob("*.part")), [])
            self.assertEqual(list(destination.parent.glob(".*.part")), [])

    def test_truncated_response_is_rejected(self):
        self.assert_rejected_and_preserved(
            response=FakeResponse(self.good),
            expected_size=1000,
        )

    def test_incorrect_content_length_is_rejected(self):
        self.assert_rejected_and_preserved(
            response=FakeResponse(self.good, headers={"Content-Length": "1000"}),
        )

    def test_wrong_git_blob_is_rejected(self):
        self.assert_rejected_and_preserved(
            response=FakeResponse(self.good, headers={"Content-Length": str(len(self.good))}),
            expected_size=len(self.good),
            expected_git_blob_sha1="0" * 40,
        )

    def test_wrong_sha256_is_rejected(self):
        self.assert_rejected_and_preserved(
            response=FakeResponse(self.good),
            expected_sha256="0" * 64,
        )

    def test_http_error_is_rejected(self):
        self.assert_rejected_and_preserved(response=FakeResponse(b"error", status=500))

    def test_empty_response_is_rejected(self):
        self.assert_rejected_and_preserved(response=FakeResponse(b""))

    def test_verified_download_promotes_and_records_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / "source.csv"
            result = download_verified_source(
                "https://example.invalid/source.csv",
                destination,
                expected_size=len(self.good),
                expected_git_blob_sha1=blob_sha(self.good),
                expected_sha256=hashlib.sha256(self.good).hexdigest(),
                urlopen=lambda *_args, **_kwargs: FakeResponse(
                    self.good,
                    headers={"Content-Length": str(len(self.good))},
                ),
            )
            self.assertEqual(destination.read_bytes(), self.good)
            self.assertEqual(result["actual_bytes_received"], len(self.good))
            self.assertEqual(result["http_content_length_declared"], len(self.good))
            self.assertEqual(result["recomputed_git_blob_sha1"], blob_sha(self.good))
            self.assertTrue(result["retrieval_started_at_utc"])
            self.assertTrue(result["retrieval_completed_at_utc"])

    def test_github_resolution_pins_latest_file_commit_and_blob(self):
        commit = "f" * 40
        blob = "c" * 40
        source = {
            "repository_owner": "owner",
            "repository_name": "repo",
            "path": "datasets/source.csv",
            "branch": "main",
            "configured_source_url": "https://raw.githubusercontent.com/owner/repo/main/datasets/source.csv",
        }

        def urlopen(request, **_kwargs):
            if "/commits?" in request.full_url:
                return FakeResponse(json.dumps([{"sha": commit}]).encode())
            self.assertIn(f"ref={commit}", request.full_url)
            return FakeResponse(json.dumps({
                "type": "file",
                "sha": blob,
                "size": 123,
                "download_url": f"https://raw.githubusercontent.com/owner/repo/{commit}/datasets/source.csv",
            }).encode())

        resolved = resolve_github_source(source, urlopen=urlopen)
        self.assertEqual(resolved["resolved_upstream_commit_sha"], commit)
        self.assertEqual(resolved["upstream_git_blob_sha1"], blob)
        self.assertEqual(resolved["expected_resolved_byte_size"], 123)
        self.assertIn(commit, resolved["immutable_resolved_raw_url"])


if __name__ == "__main__":
    unittest.main()
