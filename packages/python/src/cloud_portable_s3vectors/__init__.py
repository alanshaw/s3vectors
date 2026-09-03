"""Language-independent S3 API compatibility test vectors.

Parsed and importable per feature area or all at once, plus the deterministic
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

__all__ = ["AREAS", "load", "all", "load_all", "manifest", "Manifest", "Vector", "VectorFile"]

_DATA = resources.files(__package__) / "data"


def _read_json(name: str):
    with (_DATA / name).open("r", encoding="utf-8") as f:
        return json.load(f)


@functools.lru_cache(maxsize=1)
def manifest() -> Manifest:
    """The embedded corpus snapshot: version, totals, per-area counts."""
    return _read_json("manifest.json")


#: Area names, in manifest order.
AREAS: tuple[str, ...] = tuple(a["area"] for a in manifest()["areas"])


@functools.lru_cache(maxsize=None)
def load(area: str) -> VectorFile:
    """Load one area's vectors. Lazy; parsed once and cached (read-only)."""
    for entry in manifest()["areas"]:
        if entry["area"] == area:
            return _read_json(entry["file"])
    raise KeyError(f"unknown area: {area} (known: {', '.join(AREAS)})")


def load_all() -> list[VectorFile]:
    """Load every area, in manifest order."""
    return [load(a) for a in AREAS]


#: Alias for :func:`load_all` (shadows the ``all`` builtin only if star-imported).
all = load_all
