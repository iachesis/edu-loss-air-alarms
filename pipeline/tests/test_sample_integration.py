from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.pipeline import run_build
from aae_pipeline.utils import parse_datetime_utc
from support import make_test_project


class SampleIntegrationTests(unittest.TestCase):
    def test_sample_build_is_audited_and_monthly(self):
        with tempfile.TemporaryDirectory() as temp:
            project, source = make_test_project(Path(temp))
            output = Path(temp) / "sample"
            audit = run_build(
                root=project,
                output_dir=output,
                alarm_source=source,
                school_year="2024_2025",
                coverage_start_utc=parse_datetime_utc("2025-01-01T00:00:00+00:00"),
                coverage_end_utc=parse_datetime_utc("2025-04-01T00:00:00+00:00"),
                oblast_ids=["UA12", "UA32"],
                clean=True,
                download_if_missing=False,
                controlled_input_root=project / "data/education",
            )
            self.assertEqual(audit["status"], "PASS")
            self.assertEqual(audit["source_rows"], 2)
            self.assertEqual(audit["unmapped_alert_rows"], 0)
            self.assertEqual(audit["duplicate_alert_rows"], 0)
            self.assertEqual(audit["long_interval_review_rows"], 0)
            rows = json.loads((output / "payloads/oblast_monthly.json").read_text(encoding="utf-8"))
            covered = [r for r in rows if r["period_id"] in {"2025-01", "2025-02", "2025-03"}]
            self.assertEqual(len(covered), 6)
            kyiv_jan = next(r for r in covered if r["area_id"] == "UA32" and r["period_id"] == "2025-01")
            self.assertEqual(kyiv_jan["coverage_status"], "complete")
            self.assertAlmostEqual(kyiv_jan["alarm_seconds_average_school_location"], 2700.0, places=3)
            self.assertTrue((output / "audit/build_manifest.json").exists())
            self.assertTrue((output / "audit/duplicate_alert_rows.csv").read_text(encoding="utf-8").startswith("row_number,issue"))
            self.assertTrue((output / "payloads/payload_manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
