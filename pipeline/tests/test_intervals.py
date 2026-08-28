from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.intervals import merge_allocated_intervals, overlap_seconds


class IntervalTests(unittest.TestCase):
    def test_overlapping_and_touching_intervals_merge(self):
        base = {
            "hromada_id": "H1",
            "oblast_id": "O1",
            "raion_id": "R1",
            "source_level": "oblast",
            "precision_label": "oblast allocation",
        }
        rows = [
            {**base, "source_row_id": "1", "started_at": dt(8, 0), "finished_at": dt(9, 0)},
            {**base, "source_row_id": "2", "started_at": dt(8, 30), "finished_at": dt(10, 0)},
            {**base, "source_row_id": "3", "started_at": dt(10, 0), "finished_at": dt(10, 30)},
            {**base, "source_row_id": "4", "started_at": dt(10, 31), "finished_at": dt(11, 0)},
        ]
        merged = merge_allocated_intervals(rows)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["started_at"], dt(8, 0))
        self.assertEqual(merged[0]["finished_at"], dt(10, 30))
        self.assertEqual(merged[0]["source_row_count"], 3)

    def test_overlap_seconds(self):
        self.assertEqual(overlap_seconds(dt(8, 0), dt(10, 0), dt(9, 0), dt(11, 0)), 3600)
        self.assertEqual(overlap_seconds(dt(8, 0), dt(9, 0), dt(9, 1), dt(10, 0)), 0)

    def test_cross_midnight_interval_is_retained_and_clipped(self):
        alarm_start = datetime(2025, 1, 12, 23, 0, tzinfo=timezone.utc)
        alarm_end = datetime(2025, 1, 13, 7, 0, tzinfo=timezone.utc)
        school_start = datetime(2025, 1, 13, 6, 0, tzinfo=timezone.utc)
        school_end = datetime(2025, 1, 13, 13, 0, tzinfo=timezone.utc)
        self.assertEqual(overlap_seconds(alarm_start, alarm_end, school_start, school_end), 3600)


def dt(hour: int, minute: int) -> datetime:
    return datetime(2025, 1, 15, hour, minute, tzinfo=timezone.utc)


if __name__ == "__main__":
    unittest.main()
