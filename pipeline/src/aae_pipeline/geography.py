from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .utils import read_csv_rows


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    replacements = {
        "’": "'",
        "‘": "'",
        "ʼ": "'",
        "`": "'",
        "–": "-",
        "—": "-",
        "−": "-",
        "\u00a0": " ",
        "\u202f": " ",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"\s+", " ", text).strip()


def normalize_level(value: object) -> str:
    return normalize_text(value).lower()


@dataclass(frozen=True)
class Allocation:
    hromada_id: str
    oblast_id: str
    raion_id: str
    source_level: str
    precision_label: str


class GeographyIndex:
    def __init__(self, root: Path, sources: dict[str, Any]):
        refs = sources["reference_files"]
        self.oblast_rows = read_csv_rows(root / refs["oblasts"])
        self.raion_rows = read_csv_rows(root / refs["raions"])
        self.hromada_rows = read_csv_rows(root / refs["hromadas"])
        self.alias_rows = read_csv_rows(root / refs["aliases"])
        self.special_rows = read_csv_rows(root / refs["special_areas"])

        self.aliases: dict[str, dict[str, str]] = defaultdict(dict)
        for row in self.alias_rows:
            if row["field"] in {"oblast", "raion", "hromada"}:
                self.aliases[row["field"]][normalize_text(row["source_value"])] = normalize_text(row["canonical_value"])

        self.oblast_by_name = {
            normalize_text(row["oblast_name"]): row["oblast_id"] for row in self.oblast_rows
        }
        self.oblast_name_by_id = {row["oblast_id"]: row["oblast_name"] for row in self.oblast_rows}

        self.raion_by_key: dict[tuple[str, str], str] = {}
        self.raion_name_by_id: dict[str, str] = {}
        for row in self.raion_rows:
            key = (row["oblast_id"], normalize_text(row["raion_name"]))
            self.raion_by_key[key] = row["raion_id"]
            self.raion_name_by_id[row["raion_id"]] = row["raion_name"]

        self.hromadas_by_oblast: dict[str, list[dict[str, str]]] = defaultdict(list)
        self.hromadas_by_raion: dict[str, list[dict[str, str]]] = defaultdict(list)
        self.hromada_by_exact_key: dict[tuple[str, str, str], str] = {}
        self.hromada_candidates: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
        self.hromada_by_id: dict[str, dict[str, str]] = {}
        for row in self.hromada_rows:
            self.hromada_by_id[row["hromada_id"]] = row
            self.hromadas_by_oblast[row["oblast_id"]].append(row)
            self.hromadas_by_raion[row["raion_id"]].append(row)
            name = normalize_text(row["hromada_name"])
            self.hromada_by_exact_key[(row["oblast_id"], row["raion_id"], name)] = row["hromada_id"]
            self.hromada_candidates[(row["oblast_id"], name)].append(row)

        self.special_id_crosswalk = {
            row["source_area_id"]: row["canonical_hromada_id"] for row in self.special_rows
        }

    def canonical_oblast_name(self, value: object) -> str:
        name = normalize_text(value)
        return self.aliases["oblast"].get(name, name)

    def canonical_raion_name(self, value: object) -> str:
        name = normalize_text(value)
        return self.aliases["raion"].get(name, name)

    def canonical_hromada_name(self, value: object) -> str:
        name = normalize_text(value)
        name = self.aliases["hromada"].get(name, name)
        match = re.match(r"^м\.\s*.+?\s+та\s+(.+?територіальна громада)$", name, flags=re.IGNORECASE)
        if match:
            name = normalize_text(match.group(1))
        return name

    def canonical_hromada_id(self, value: object) -> str:
        raw = normalize_text(value)
        return self.special_id_crosswalk.get(raw, raw)

    def allocate(self, row: dict[str, str]) -> tuple[list[Allocation], str | None]:
        allocations, issue, _route = self.allocate_with_route(row)
        return allocations, issue

    def allocate_with_route(
        self,
        row: dict[str, str],
    ) -> tuple[list[Allocation], str | None, str]:
        """Allocate one source row and expose the deterministic mapping route."""
        level = normalize_level(row.get("level"))
        oblast_name = self.canonical_oblast_name(row.get("oblast"))
        oblast_id = self.oblast_by_name.get(oblast_name)
        if not oblast_id:
            return [], f"unmapped oblast: {oblast_name or '<blank>'}", "unmapped_oblast"

        raw_hromada = normalize_text(row.get("hromada"))
        controlled_level_correction = False
        if level == "hromada" and raw_hromada == "Звягельський район":
            level = "raion"
            controlled_level_correction = True
            row = dict(row)
            row["raion"] = raw_hromada
            row["hromada"] = ""

        if level == "oblast":
            targets = self.hromadas_by_oblast.get(oblast_id, [])
            if not targets:
                return [], f"oblast has no hromadas: {oblast_id}", "unmapped_oblast"
            return [
                Allocation(t["hromada_id"], oblast_id, t["raion_id"], level, "oblast allocation")
                for t in targets
            ], None, "oblast_allocation"

        raion_name = self.canonical_raion_name(row.get("raion"))
        raion_id = self.raion_by_key.get((oblast_id, raion_name)) if raion_name else None

        if level == "raion":
            if not raion_id:
                return [], f"unmapped raion: {oblast_name} / {raion_name or '<blank>'}", "unmapped_raion"
            targets = self.hromadas_by_raion.get(raion_id, [])
            if not targets:
                return [], f"raion has no hromadas: {raion_id}", "unmapped_raion"
            return [
                Allocation(t["hromada_id"], oblast_id, raion_id, level, "raion allocation")
                for t in targets
            ], None, "controlled_level_correction" if controlled_level_correction else "raion_allocation"

        if level == "hromada":
            hromada_name = self.canonical_hromada_name(row.get("hromada"))
            if not hromada_name:
                return [], f"blank hromada name: {oblast_name}", "unmapped_hromada"
            hromada_id: str | None = None
            route = "hromada_exact_parent"
            if raion_id:
                hromada_id = self.hromada_by_exact_key.get((oblast_id, raion_id, hromada_name))
            if not hromada_id:
                candidates = self.hromada_candidates.get((oblast_id, hromada_name), [])
                if len(candidates) == 1:
                    hromada_id = candidates[0]["hromada_id"]
                    raion_id = candidates[0]["raion_id"]
                    route = "hromada_unique_oblast_fallback"
                elif len(candidates) > 1:
                    return [], f"ambiguous hromada: {oblast_name} / {hromada_name}", "ambiguous_hromada"
            if not hromada_id:
                return [], f"unmapped hromada: {oblast_name} / {raion_name} / {hromada_name}", "unmapped_hromada"
            return [Allocation(hromada_id, oblast_id, raion_id or "", level, "hromada")], None, route

        return [], f"unsupported level: {level or '<blank>'}", "unsupported_level"

    def selected_hromada_ids(self, oblast_ids: list[str] | None) -> list[str]:
        if not oblast_ids:
            return sorted(self.hromada_by_id)
        selected: list[str] = []
        for oblast_id in oblast_ids:
            selected.extend(row["hromada_id"] for row in self.hromadas_by_oblast.get(oblast_id, []))
        return sorted(set(selected))
