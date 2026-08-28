from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.local_runner import run_local_build
from aae_pipeline.preflight import run_preflight
from aae_pipeline.review import create_review_archive
from aae_pipeline.utils import sha256_file
from support import make_test_project


class LocalExecutionTests(unittest.TestCase):
    def test_preflight_with_local_sample(self):
        with tempfile.TemporaryDirectory() as temp:
            project, source = make_test_project(Path(temp))
            report_path = Path(temp) / "preflight.json"
            report = run_preflight(
                root=project,
                output_path=report_path,
                alarm_source=source,
                alarm_source_sha256=sha256_file(source),
                skip_network=True,
                minimum_free_gb=0.0,
            )
            self.assertEqual(report["status"], "PASS")
            self.assertTrue(report_path.exists())

    def test_restartable_local_build_and_review_archive(self):
        with tempfile.TemporaryDirectory() as temp:
            project, source = make_test_project(Path(temp))
            output = Path(temp) / "full"
            state = run_local_build(
                root=project,
                output_dir=output,
                alarm_source=source,
                alarm_source_sha256=sha256_file(source),
                school_years=["2024_2025"],
                oblast_ids=["UA12", "UA32"],
                resume=True,
                fresh=True,
            )
            self.assertIn(state["status"], {"PASS", "PASS_WITH_REVIEW_FLAGS"})
            qa = json.loads((output / "final/audit/qa_summary.json").read_text(encoding="utf-8"))
            self.assertEqual(qa["review_status"], "READY_FOR_INDEPENDENT_REVIEW")
            self.assertEqual(qa["checks_passed"], qa["checks_total"])

            state_path = output / "state/build_state.json"
            interrupted = json.loads(state_path.read_text(encoding="utf-8"))
            interrupted["status"] = "PARTIAL"
            interrupted.pop("final_build_id", None)
            state_path.write_text(json.dumps(interrupted, indent=2) + "\n", encoding="utf-8")
            resumed = run_local_build(
                root=project,
                output_dir=output,
                alarm_source=source,
                alarm_source_sha256=sha256_file(source),
                school_years=["2024_2025"],
                oblast_ids=["UA12", "UA32"],
                resume=True,
                fresh=False,
            )
            self.assertEqual(resumed["final_build_id"], state["final_build_id"])

            result = create_review_archive(root=project, output_dir=output)
            archive_path = Path(result["archive_path"])
            self.assertTrue(archive_path.exists())
            with zipfile.ZipFile(archive_path) as archive:
                names = set(archive.namelist())
            self.assertIn("AAE_REVIEW_PACKAGE/REVIEW_MANIFEST.json", names)
            self.assertIn("AAE_REVIEW_PACKAGE/audit/qa_summary.json", names)
            self.assertIn("AAE_REVIEW_PACKAGE/payloads/oblast_monthly.json", names)
            self.assertIn("AAE_REVIEW_PACKAGE/source/source_manifest.json", names)
            self.assertIn("AAE_REVIEW_PACKAGE/execution/project_inventory.json", names)
            self.assertIn("AAE_REVIEW_PACKAGE/execution/src/aae_pipeline/pipeline.py", names)
            self.assertNotIn("AAE_REVIEW_PACKAGE/source/official_data_uk.csv.gz", names)
            self.assertFalse(any("execution/data/education/" in name for name in names))


if __name__ == "__main__":
    unittest.main()
