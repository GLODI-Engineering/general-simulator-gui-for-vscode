"""Result manifest reader for the slice server."""

from __future__ import annotations

import json
import pathlib
from typing import Any


def load_manifest(results_root: pathlib.Path, sim_id: str) -> dict[str, Any]:
    """Load and return the manifest.json for the given sim_id."""
    manifest_path = results_root / sim_id / "manifest.json"
    with manifest_path.open("r", encoding="utf-8") as f:
        result: dict[str, Any] = json.load(f)
        return result
