"""Language-independent S3 API compatibility test vectors.

Parsed and importable per feature group or all at once, plus the deterministic
test-data generator (`cloud_portable_s3vectors.datagen`).

Normative semantics (placeholder grammar, matcher semantics, generated data,
runner outcomes) are defined in the repository README:
https://github.com/cloud-portable/s3vectors

Returned objects are parsed once and cached: treat them as read-only.
"""

from __future__ import annotations

import functools
import json
from importlib import resources

from ._types import Manifest, Vector, VectorFile

__all__ = ["GROUPS", "load", "all", "load_all", "manifest", "Manifest", "Vector", "VectorFile"]

_DATA = resources.files(__package__) / "data"


def _read_json(name: str):
    with (_DATA / name).open("r", encoding="utf-8") as f:
        return json.load(f)


@functools.lru_cache(maxsize=1)
def manifest() -> Manifest:
    """The embedded corpus snapshot: version, totals, per-group counts."""
    return _read_json("manifest.json")


#: Group names, in manifest order.
GROUPS: tuple[str, ...] = tuple(g["group"] for g in manifest()["groups"])


@functools.lru_cache(maxsize=None)
def load(group: str) -> VectorFile:
    """Load one group's vectors. Lazy; parsed once and cached (read-only)."""
    for entry in manifest()["groups"]:
        if entry["group"] == group:
            return _read_json(entry["file"])
    raise KeyError(f"unknown group: {group} (known: {', '.join(GROUPS)})")


def load_all() -> list[VectorFile]:
    """Load every group, in manifest order."""
    return [load(g) for g in GROUPS]


#: Alias for :func:`load_all` (shadows the ``all`` builtin only if star-imported).
all = load_all
