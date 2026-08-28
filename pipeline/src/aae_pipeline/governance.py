from __future__ import annotations

from pathlib import Path
from typing import Any

from .utils import read_json, sha256_file


REQUIRED_DOCUMENTS = {
    "methodology": "methodology_version",
    "indicator_dictionary": "indicator_dictionary_version",
    "input_data_contract": "input_data_contract_version",
    "processing_package": "processing_package_version",
    "local_execution_package": "local_execution_package_version",
}


def load_governed_versions(root: Path, assumptions: dict[str, Any]) -> dict[str, str]:
    controlled = read_json(root / "config/governed_versions.json")
    if controlled.get("schema_version") != 1:
        raise ValueError("config/governed_versions.json has an unsupported schema")
    documents = controlled.get("documents")
    if not isinstance(documents, dict):
        raise ValueError("Governed document versions are missing")

    metadata: dict[str, str] = {}
    for key, output_key in REQUIRED_DOCUMENTS.items():
        item = documents.get(key)
        if not isinstance(item, dict):
            raise ValueError(f"Missing governed document entry: {key}")
        version = item.get("version")
        document_id = item.get("document_id")
        sha256 = item.get("authoritative_sha256")
        if not isinstance(version, str) or not version:
            raise ValueError(f"Missing governed version: {key}")
        if not isinstance(document_id, str) or not document_id:
            raise ValueError(f"Missing governed document ID: {key}")
        if not isinstance(sha256, str) or len(sha256) != 64:
            raise ValueError(f"Missing authoritative document hash: {key}")
        metadata[output_key] = version

    assumptions_version = assumptions.get("version")
    governed_assumptions = controlled.get("assumptions", {}).get("version")
    governed_assumptions_hash = controlled.get("assumptions", {}).get("authoritative_sha256")
    if assumptions_version != governed_assumptions:
        raise ValueError(
            f"Assumptions version mismatch: config={assumptions_version!r}, governed={governed_assumptions!r}"
        )
    if not isinstance(governed_assumptions_hash, str) or len(governed_assumptions_hash) != 64:
        raise ValueError("Missing governed assumptions hash")
    actual_assumptions_hash = sha256_file(root / "config/assumptions.json")
    if actual_assumptions_hash != governed_assumptions_hash:
        raise ValueError(
            "Assumptions hash mismatch: "
            f"actual={actual_assumptions_hash}, governed={governed_assumptions_hash}"
        )
    metadata["assumptions_version"] = str(assumptions_version)
    metadata["governed_versions_schema"] = str(controlled["schema_version"])
    return metadata
