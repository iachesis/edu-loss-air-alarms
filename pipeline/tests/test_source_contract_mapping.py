from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.geography import GeographyIndex
from aae_pipeline.source_prepare import DetailedMappingError, SourceContractError, prepare_alarm_source


FIELDS = ["oblast", "raion", "hromada", "level", "started_at", "finished_at", "source"]


def official_row(**changes):
    row = {
        "oblast": "Дніпропетровська область",
        "raion": "",
        "hromada": "",
        "level": "oblast",
        "started_at": "2025-01-13T06:00:00+00:00",
        "finished_at": "2025-01-13T07:00:00+00:00",
        "source": "official",
    }
    row.update(changes)
    return row


class SourceContractMappingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = json.loads((ROOT / "config/sources.json").read_text(encoding="utf-8"))
        cls.assumptions = json.loads((ROOT / "config/assumptions.json").read_text(encoding="utf-8"))
        cls.geography = GeographyIndex(ROOT, cls.sources)

    def prepare(self, temp: Path, rows: list[dict], *, fieldnames=FIELDS):
        source = temp / "source.csv"
        with source.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        return prepare_alarm_source(
            alarm_source=source,
            output_dir=temp / "prepared",
            geography=self.geography,
            assumptions=self.assumptions,
            source_contract=self.sources["air_alarm_source"],
        )

    def assert_mapping_hard_failure(self, row: dict, expected_route: str):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            with self.assertRaises(DetailedMappingError) as captured:
                self.prepare(temp_path, [row])
            summary = captured.exception.summary
            self.assertEqual(summary["detailed_mapping_failure_count"], 1)
            self.assertEqual(summary["mapping_route_counts"].get(expected_route), 1)
            self.assertTrue((temp_path / "prepared/audit/detailed_mapping_results.csv.gz").exists())
            self.assertTrue((temp_path / "prepared/audit/detailed_mapping_failures.csv").exists())

    def test_unmapped_oblast_is_a_hard_failure(self):
        self.assert_mapping_hard_failure(
            official_row(oblast="Неіснуюча область"),
            "unmapped_oblast",
        )

    def test_unmapped_raion_is_a_hard_failure(self):
        self.assert_mapping_hard_failure(
            official_row(level="raion", raion="Неіснуючий район"),
            "unmapped_raion",
        )

    def test_unmapped_hromada_is_a_hard_failure(self):
        self.assert_mapping_hard_failure(
            official_row(level="hromada", raion="Нікопольський район", hromada="Неіснуюча громада"),
            "unmapped_hromada",
        )

    def test_unsupported_level_is_a_hard_failure(self):
        self.assert_mapping_hard_failure(official_row(level="village"), "unsupported_level")

    def test_ambiguous_hromada_is_a_hard_failure(self):
        self.assert_mapping_hard_failure(
            official_row(
                oblast="Автономна Республіка Крим",
                level="hromada",
                hromada="Табачненська територіальна громада",
            ),
            "ambiguous_hromada",
        )

    def test_composite_alias_and_controlled_level_correction_succeed(self):
        rows = [
            official_row(
                level="hromada",
                raion="Нікопольський район",
                hromada="м. Нікополь та Нікопольська територіальна громада",
            ),
            official_row(
                oblast="Житомирська область",
                level="hromada",
                raion="Звягельський район",
                hromada="Звягельський район",
                started_at="2025-01-30T00:12:59+00:00",
                finished_at="2025-01-30T02:59:19+00:00",
            ),
        ]
        with tempfile.TemporaryDirectory() as temp:
            summary = self.prepare(Path(temp), rows)
        self.assertEqual(summary["detailed_mapping_failure_count"], 0)
        self.assertEqual(summary["mapped_valid_unique_row_count"], 2)
        self.assertEqual(summary["mapping_route_counts"]["hromada_exact_parent"], 1)
        self.assertEqual(summary["mapping_route_counts"]["controlled_level_correction"], 1)

    def test_exact_schema_and_source_domain_are_hard_invariants(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                self.prepare(Path(temp), [official_row(extra="x")], fieldnames=FIELDS + ["extra"])
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(SourceContractError) as captured:
                self.prepare(Path(temp), [official_row(source="uncontrolled")])
            self.assertEqual(captured.exception.summary["source_contract_violation_count"], 1)

    def test_zero_negative_rejection_and_long_interval_retention(self):
        rows = [
            official_row(finished_at="2025-01-13T06:00:00+00:00"),
            official_row(
                started_at="2025-01-14T07:00:00+00:00",
                finished_at="2025-01-14T06:00:00+00:00",
            ),
            official_row(
                started_at="2025-01-15T06:00:00+00:00",
                finished_at="2025-01-17T06:00:00+00:00",
            ),
        ]
        with tempfile.TemporaryDirectory() as temp:
            summary = self.prepare(Path(temp), rows)
        self.assertEqual(summary["invalid_row_count"], 2)
        self.assertEqual(summary["valid_unique_source_row_count"], 1)
        self.assertEqual(summary["mapped_valid_unique_row_count"], 1)
        self.assertEqual(summary["long_interval_review_row_count"], 1)


if __name__ == "__main__":
    unittest.main()
