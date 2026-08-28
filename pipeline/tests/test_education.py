from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.education import load_education_context
from aae_pipeline.geography import GeographyIndex
from support import make_test_project


class EducationTests(unittest.TestCase):
    def test_january_2023_offline_is_derived(self):
        with tempfile.TemporaryDirectory() as temp:
            project, _alarm_source = make_test_project(Path(temp))
            sources = json.loads((project / "config/sources.json").read_text(encoding="utf-8"))
            geography = GeographyIndex(project, sources)
            selected = set(geography.hromada_by_id)
            context, issues, summary = load_education_context(
                project,
                sources,
                geography,
                "2022_2023",
                selected,
            )
        self.assertEqual(summary["offline_mode"], "derived_total_minus_online")
        self.assertEqual(summary["derived_offline_rows"], summary["eligible_school_rows"])
        self.assertEqual(summary["negative_derived_offline_rows"], 0)
        self.assertEqual(summary["linked_context_totals"]["learners_offline"], 180)
        self.assertEqual(
            summary["linked_context_totals"]["learners_total"],
            summary["linked_context_totals"]["learners_offline"]
            + summary["linked_context_totals"]["learners_online"],
        )
        self.assertFalse(any(row["issue"] == "derived children_offline is negative" for row in issues))


if __name__ == "__main__":
    unittest.main()
