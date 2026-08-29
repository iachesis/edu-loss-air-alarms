from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.aggregate import aggregate_hromada_periods, aggregate_multi_area
from aae_pipeline.geography import GeographyIndex
from aae_pipeline.governance import load_governed_versions
from aae_pipeline.payloads import build_payloads
from aae_pipeline.utils import read_json, sha256_file


class SemanticsMetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = read_json(ROOT / "config/sources.json")
        cls.geography = GeographyIndex(ROOT, cls.sources)

    def hromada_id(self, oblast_id: str) -> str:
        return self.geography.hromadas_by_oblast[oblast_id][0]["hromada_id"]

    def daily(self, oblast_id: str, *, alarm: int, available: int, status: str):
        hromada_id = self.hromada_id(oblast_id)
        meta = self.geography.hromada_by_id[hromada_id]
        return {
            "school_year": "2024_2025",
            "date": "2025-01-13",
            "month": "2025-01",
            "oblast_id": oblast_id,
            "raion_id": meta["raion_id"],
            "hromada_id": hromada_id,
            "alarm_seconds": alarm,
            "available_school_seconds": available,
            "expected_school_seconds": 25200,
            "affected_school_day": 1 if alarm else 0,
            "episode_ids": ["E1"] if alarm else [],
            "source_levels": ["oblast"] if alarm else [],
            "coverage_status": status,
        }

    def test_not_covered_survives_hromada_oblast_and_mixed_national_aggregation(self):
        daily = [
            self.daily("UA01", alarm=0, available=0, status="not_covered"),
            self.daily("UA44", alarm=0, available=0, status="not_covered"),
            self.daily("UA12", alarm=100, available=25200, status="complete"),
        ]
        education = {
            row["hromada_id"]: {
                "school_count": 0 if row["oblast_id"] == "UA01" else 1,
                "learners_total": 0 if row["oblast_id"] == "UA01" else 100,
                "learners_offline": 0 if row["oblast_id"] == "UA01" else 90,
                "learners_online": 0 if row["oblast_id"] == "UA01" else 10,
                "learners_mixed": 0,
                "snapshot_date": "2025-03-20",
            }
            for row in daily
        }
        monthly, yearly = aggregate_hromada_periods(daily, education, self.geography.hromada_by_id)
        for oblast_id in ["UA01", "UA44"]:
            row = next(item for item in monthly if item["oblast_id"] == oblast_id)
            self.assertEqual(row["coverage_status"], "not_covered")
            self.assertIsNone(row["alarm_seconds"])
            self.assertIsNone(row["alarm_hours"])
            self.assertEqual(row["available_school_seconds"], 0)
            self.assertEqual(row["comparable_school_count"], 0)
            self.assertIsNone(row["school_time_under_alarm_pct"])

        oblast = aggregate_multi_area(monthly, "oblast")
        crimea = next(row for row in oblast if row["area_id"] == "UA01")
        self.assertEqual(crimea["coverage_status"], "not_covered")
        self.assertIsNone(crimea["alarm_seconds_average_school_location"])
        self.assertEqual(crimea["school_count"], 0)
        self.assertEqual(crimea["comparable_school_count"], 0)

        national = aggregate_multi_area(monthly, "national")[0]
        self.assertEqual(national["coverage_status"], "partial")
        self.assertGreater(national["available_school_seconds_average_school_location"], 0)
        self.assertIsNotNone(national["alarm_seconds_average_school_location"])
        self.assertEqual(national["school_count"], 2)
        self.assertEqual(national["comparable_school_count"], 1)

        national_year = aggregate_multi_area(yearly, "national")[0]
        self.assertEqual(national_year["coverage_status"], "partial")

    def test_generic_zero_denominator_remains_unavailable(self):
        daily = [self.daily("UA12", alarm=0, available=0, status="unavailable")]
        hromada_id = daily[0]["hromada_id"]
        education = {hromada_id: {"school_count": 1, "snapshot_date": "2025-03-20"}}
        monthly, _yearly = aggregate_hromada_periods(daily, education, self.geography.hromada_by_id)
        self.assertEqual(monthly[0]["coverage_status"], "unavailable")

    def test_multi_year_weighting_uses_each_years_school_counts(self):
        def row(hromada_id, period_id, school_count, alarm):
            return {
                "area_level": "hromada",
                "oblast_id": "UA12",
                "raion_id": "R",
                "hromada_id": hromada_id,
                "school_year": period_id,
                "period_type": "school_year",
                "period_id": period_id,
                "alarm_seconds": alarm,
                "available_school_seconds": 1000,
                "expected_school_seconds": 1000,
                "affected_school_days": 1,
                "available_school_days": 1,
                "expected_school_days": 1,
                "school_time_alarm_episodes": 1,
                "source_precision_label": "oblast allocation",
                "coverage_status": "complete",
                "school_count": school_count,
                "learners_total": school_count * 10,
                "learners_offline": 0,
                "learners_online": 0,
                "learners_mixed": 0,
                "education_snapshot_date": period_id,
            }

        rows = [
            row("H1", "2023_2024", 1, 100),
            row("H2", "2023_2024", 3, 300),
            row("H1", "2024_2025", 3, 100),
            row("H2", "2024_2025", 1, 300),
        ]
        aggregated = {row["period_id"]: row for row in aggregate_multi_area(rows, "oblast")}
        self.assertEqual(aggregated["2023_2024"]["alarm_seconds_average_school_location"], 250)
        self.assertEqual(aggregated["2024_2025"]["alarm_seconds_average_school_location"], 150)

    def test_governed_versions_reconcile_and_fail_when_missing_or_inconsistent(self):
        assumptions = read_json(ROOT / "config/assumptions.json")
        versions = load_governed_versions(ROOT, assumptions)
        self.assertEqual(versions["methodology_version"], "0.2")
        self.assertEqual(versions["indicator_dictionary_version"], "0.3")
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp)
            shutil.copytree(ROOT / "config", project / "config")
            governed_path = project / "config/governed_versions.json"
            governed = read_json(governed_path)
            del governed["documents"]["methodology"]
            governed_path.write_text(json.dumps(governed), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_governed_versions(project, assumptions)
        inconsistent = dict(assumptions)
        inconsistent["version"] = "999"
        with self.assertRaises(ValueError):
            load_governed_versions(ROOT, inconsistent)

    def test_payload_generation_is_byte_deterministic(self):
        national = [{
            "area_level": "national",
            "area_id": "UA",
            "school_year": "2024_2025",
            "period_type": "month",
            "period_id": "2025-01",
            "alarm_seconds_average_school_location": 1.23456789,
            "coverage_status": "partial",
        }]
        metadata = {"build_id": "DETERMINISTIC", "source_sha256": "a" * 64}
        with tempfile.TemporaryDirectory() as temp:
            first = Path(temp) / "first"
            second = Path(temp) / "second"
            build_payloads(first, metadata, [], [], [], [], national, [])
            build_payloads(second, metadata, [], [], [], [], national, [])
            first_hashes = {
                path.relative_to(first).as_posix(): sha256_file(path)
                for path in first.rglob("*")
                if path.is_file()
            }
            second_hashes = {
                path.relative_to(second).as_posix(): sha256_file(path)
                for path in second.rglob("*")
                if path.is_file()
            }
            self.assertEqual(first_hashes, second_hashes)


if __name__ == "__main__":
    unittest.main()
