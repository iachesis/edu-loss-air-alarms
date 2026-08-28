from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.geography import GeographyIndex


class GeographyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sources = json.loads((ROOT / "config/sources.json").read_text(encoding="utf-8"))
        cls.geo = GeographyIndex(ROOT, sources)

    def test_oblast_allocation(self):
        allocated, issue = self.geo.allocate({
            "oblast": "Дніпропетровська область",
            "raion": "",
            "hromada": "",
            "level": "oblast",
        })
        self.assertIsNone(issue)
        self.assertGreater(len(allocated), 50)
        self.assertTrue(all(row.oblast_id == "UA12" for row in allocated))

    def test_composite_hromada_name(self):
        allocated, issue = self.geo.allocate({
            "oblast": "Дніпропетровська область",
            "raion": "Нікопольський район",
            "hromada": "м. Нікополь та Нікопольська територіальна громада",
            "level": "hromada",
        })
        self.assertIsNone(issue)
        self.assertEqual(len(allocated), 1)
        self.assertEqual(allocated[0].source_level, "hromada")

    def test_raion_allocation(self):
        allocated, issue = self.geo.allocate({
            "oblast": "Дніпропетровська область",
            "raion": "Нікопольський район",
            "hromada": "",
            "level": "raion",
        })
        self.assertIsNone(issue)
        self.assertGreater(len(allocated), 1)
        self.assertTrue(all(row.precision_label == "raion allocation" for row in allocated))

    def test_kyiv_education_crosswalk(self):
        self.assertEqual(
            self.geo.canonical_hromada_id("UA80000000000093317"),
            "UA80000000000479391",
        )


if __name__ == "__main__":
    unittest.main()
