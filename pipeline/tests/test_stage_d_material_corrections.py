from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.aggregate import aggregate_multi_area


EXPECTED_FALSE_NOT_APPLICABLE = {
    "UA05": {"2025_2026"},
    "UA07": {"2025_2026"},
    "UA12": {"2024_2025", "2025-06", "2025-09", "2025-10", "2025-11", "2025_2026"},
    "UA14": {"2025-11", "2025_2026"},
    "UA18": {"2025-10", "2025_2026"},
    "UA21": {"2025_2026"},
    "UA23": {"2025-11", "2025_2026"},
    "UA26": {"2025_2026"},
    "UA32": {"2025-09", "2025-10", "2025_2026"},
    "UA35": {"2025-09", "2025-10", "2025_2026"},
    "UA46": {"2025_2026"},
    "UA48": {"2025-11", "2025_2026"},
    "UA51": {"2025-11", "2025_2026"},
    "UA53": {"2025-10", "2025_2026"},
    "UA56": {"2025-09", "2025-10", "2025_2026"},
    "UA59": {"2025-10", "2025_2026"},
    "UA61": {"2025_2026"},
    "UA63": {"2025-10", "2025_2026"},
    "UA65": {"2025-10", "2025-11", "2025_2026"},
    "UA71": {"2024_2025", "2025-01", "2025-02", "2025-04", "2025-05", "2025-09", "2025-10", "2025-11", "2025_2026"},
    "UA73": {"2025_2026"},
    "UA74": {"2025-10", "2025_2026"},
}


def load_hromada_payloads(period_type: str) -> list[dict[str, object]]:
    pattern = "hromada_monthly_UA*.json" if period_type == "month" else "hromada_school_year_UA*.json"
    rows: list[dict[str, object]] = []
    for path in sorted((REPOSITORY_ROOT / "data").glob(pattern)):
        rows.extend(json.loads(path.read_text(encoding="utf-8")))
    return rows


class StageDMaterialCorrectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hromada_monthly = load_hromada_payloads("month")
        cls.hromada_yearly = load_hromada_payloads("school_year")
        cls.national_yearly = {
            row["period_id"]: row
            for row in aggregate_multi_area(cls.hromada_yearly, "national")
        }

    def assert_national_target(
        self,
        period_id: str,
        *,
        schools: int,
        comparable: int,
        learners: int,
        hours: float,
        affected_days: float,
        available_days: float,
        episodes: float,
        time_share: float,
        affected_share: float,
    ) -> None:
        row = self.national_yearly[period_id]
        self.assertEqual(row["school_count"], schools)
        self.assertEqual(row["comparable_school_count"], comparable)
        self.assertEqual(row["learners_total"], learners)
        self.assertEqual(round(row["alarm_hours_average_school_location"], 6), hours)
        self.assertEqual(round(row["affected_school_days_average_school_location"], 6), affected_days)
        self.assertEqual(round(row["available_school_days_average_school_location"], 6), available_days)
        self.assertEqual(round(row["school_time_alarm_episodes_average_school_location"], 6), episodes)
        self.assertEqual(round(row["school_time_under_alarm_pct"], 6), time_share)
        self.assertEqual(
            round(
                row["affected_school_days_average_school_location"]
                / row["available_school_days_average_school_location"]
                * 100,
                6,
            ),
            affected_share,
        )
        self.assertEqual(row["coverage_status"], "partial")
        self.assertEqual(row["source_precision_label"], "mixed")

    def test_exact_2024_25_national_correction(self):
        self.assert_national_target(
            "2024_2025",
            schools=13_488,
            comparable=13_405,
            learners=3_692_865,
            hours=134.321636,
            affected_days=88.338530,
            available_days=196.000000,
            episodes=151.042596,
            time_share=9.790207,
            affected_share=45.070679,
        )

    def test_exact_2025_26_national_correction_and_integer_numerators(self):
        self.assert_national_target(
            "2025_2026",
            schools=12_800,
            comparable=12_723,
            learners=3_534_336,
            hours=169.938713,
            affected_days=80.584532,
            available_days=197.000000,
            episodes=136.021064,
            time_share=12.323329,
            affected_share=40.905854,
        )
        comparable = [
            row for row in self.hromada_yearly
            if row["period_id"] == "2025_2026"
            and row["coverage_status"] in {"complete", "partial"}
            and int(row["school_count"]) > 0
        ]
        self.assertEqual(
            sum(int(row["alarm_seconds"]) * int(row["school_count"]) for row in comparable),
            7_783_668_864,
        )
        self.assertEqual(
            sum(int(row["affected_school_days"]) * int(row["school_count"]) for row in comparable),
            1_025_277,
        )
        self.assertEqual(
            sum(int(row["school_time_alarm_episodes"]) * int(row["school_count"]) for row in comparable),
            1_730_596,
        )

    def test_all_52_known_precision_rows_propagate_mixed(self):
        rows = aggregate_multi_area(self.hromada_monthly, "oblast") + aggregate_multi_area(
            self.hromada_yearly,
            "oblast",
        )
        by_key = {(row["area_id"], row["period_id"]): row for row in rows}
        expected_keys = {
            (area_id, period_id)
            for area_id, period_ids in EXPECTED_FALSE_NOT_APPLICABLE.items()
            for period_id in period_ids
        }
        self.assertEqual(len(expected_keys), 52)
        for key in expected_keys:
            self.assertEqual(by_key[key]["source_precision_label"], "mixed", key)

        false_not_applicable = [
            row for row in rows
            if (row["alarm_seconds_average_school_location"] or 0) > 0
            and row["source_precision_label"] == "not applicable"
        ]
        self.assertEqual(false_not_applicable, [])

    def test_checked_oblast_numbers_do_not_change_with_precision_fix(self):
        rows = {
            row["area_id"]: row
            for row in aggregate_multi_area(self.hromada_yearly, "oblast")
            if row["period_id"] == "2025_2026"
        }
        for area_id, hours in {"UA32": 70.953287, "UA05": 36.957251, "UA59": 625.432918}.items():
            self.assertEqual(round(rows[area_id]["alarm_hours_average_school_location"], 6), hours)
            self.assertEqual(rows[area_id]["source_precision_label"], "mixed")


if __name__ == "__main__":
    unittest.main()
