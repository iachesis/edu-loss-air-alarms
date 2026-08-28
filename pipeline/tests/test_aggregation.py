from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.aggregate import aggregate_multi_area


class AggregationTests(unittest.TestCase):
    def test_school_location_weighting(self):
        rows = [
            row("H1", school_count=1, alarm_seconds=100, available=1000, affected=1, episodes=2),
            row("H2", school_count=3, alarm_seconds=300, available=1000, affected=3, episodes=4),
        ]
        result = aggregate_multi_area(rows, "oblast")[0]
        self.assertAlmostEqual(result["alarm_seconds_average_school_location"], 250.0)
        self.assertAlmostEqual(result["available_school_seconds_average_school_location"], 1000.0)
        self.assertAlmostEqual(result["school_time_under_alarm_pct"], 25.0)
        self.assertAlmostEqual(result["affected_school_days_average_school_location"], 2.5)
        self.assertEqual(result["school_count"], 4)


def row(hromada_id, school_count, alarm_seconds, available, affected, episodes):
    return {
        "area_level": "hromada",
        "oblast_id": "UA12",
        "raion_id": "R",
        "hromada_id": hromada_id,
        "school_year": "2024_2025",
        "period_type": "month",
        "period_id": "2025-01",
        "alarm_seconds": alarm_seconds,
        "available_school_seconds": available,
        "expected_school_seconds": available,
        "affected_school_days": affected,
        "available_school_days": 10,
        "expected_school_days": 10,
        "school_time_alarm_episodes": episodes,
        "source_precision_label": "oblast allocation",
        "coverage_status": "complete",
        "school_count": school_count,
        "learners_total": school_count * 100,
        "learners_offline": 0,
        "learners_online": 0,
        "learners_mixed": 0,
        "education_snapshot_date": "2025-03-20",
    }


if __name__ == "__main__":
    unittest.main()
