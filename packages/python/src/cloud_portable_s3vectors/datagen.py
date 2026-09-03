"""Python port of the vector generated-data reference.

Materializes a vector's named datasets and computes the derived digest strings
that ``${data.<name>.<field>}`` placeholders resolve to. Stdlib-only: CRC-32C
and CRC-64/NVME use pure-Python tables (slow on large datasets; the digest
algorithms are size-independent).
"""

from __future__ import annotations

import base64
import hashlib
import struct
import zlib
from collections.abc import Mapping
from typing import Any

__all__ = ["DERIVED_FIELDS", "generate", "derived"]

#: The fields available as ``${data.<name>.<field>}`` placeholders.
DERIVED_FIELDS: tuple[str, ...] = (
    "size", "md5", "etag", "sha256", "sha256B64", "sha1B64",
    "crc32B64", "crc32cB64", "crc64nvmeB64",
)


def _prng(seed: str, size: int) -> bytes:
    # block(i) = SHA256(UTF8(seed) || BE64(i)); stream = block(0) || block(1) || ...
    seeded = hashlib.sha256(seed.encode("utf-8"))
    out = bytearray()
    i = 0
    while len(out) < size:
        h = seeded.copy()
        h.update(struct.pack(">Q", i))
        out += h.digest()
        i += 1
    return bytes(out[:size])


def _pattern(pattern_bytes: bytes, size: int) -> bytes:
    if not pattern_bytes:
        raise ValueError("empty pattern")
    reps = size // len(pattern_bytes) + 1
    return (pattern_bytes * reps)[:size]


def generate(specs: Mapping[str, Mapping[str, Any]], name: str) -> bytes:
    """Materialize one named dataset from a vector's ``data`` map."""
    spec = specs.get(name)
    if spec is None:
        raise KeyError(f"unknown dataset: {name}")
    if "$prng" in spec:
        d = spec["$prng"]
        return _prng(d["seed"], d["size"])
    if "$pattern" in spec:
        d = spec["$pattern"]
        if "pattern" in d:
            return _pattern(d["pattern"].encode("utf-8"), d["size"])
        return _pattern(base64.b64decode(d["patternBase64"]), d["size"])
    if "$slice" in spec:
        d = spec["$slice"]
        parent = specs.get(d["of"])
        if parent is None:
            raise KeyError(f"slice {name!r} references unknown dataset {d['of']!r}")
        if "$slice" in parent:
            raise ValueError(f"slice {name!r} references slice {d['of']!r} (chained slices are not allowed)")
        base = generate(specs, d["of"])
        offset, length = d["offset"], d["length"]
        if offset + length > len(base):
            raise ValueError(
                f"slice {name!r} [{offset}, {offset + length}) exceeds {d['of']!r} size {len(base)}"
            )
        return base[offset:offset + length]
    raise ValueError(f"unknown data kind: {sorted(spec)}")


def _make_crc_table(poly: int, width: int) -> list[int]:
    mask = (1 << width) - 1
    table = []
    for n in range(256):
        c = n
        for _ in range(8):
            c = (c >> 1) ^ poly if c & 1 else c >> 1
        table.append(c & mask)
    return table


_CRC32C_TABLE = _make_crc_table(0x82F63B78, 32)
# CRC-64/NVME: reflected poly, init/xorout all-ones.
_CRC64NVME_TABLE = _make_crc_table(0x9A6C9329AC4BC9B5, 64)


def _crc32c(data: bytes) -> int:
    c = 0xFFFFFFFF
    for b in data:
        c = _CRC32C_TABLE[(c ^ b) & 0xFF] ^ (c >> 8)
    return c ^ 0xFFFFFFFF


def _crc64nvme(data: bytes) -> int:
    c = 0xFFFFFFFFFFFFFFFF
    for b in data:
        c = _CRC64NVME_TABLE[(c ^ b) & 0xFF] ^ (c >> 8)
    return c ^ 0xFFFFFFFFFFFFFFFF


def derived(specs: Mapping[str, Mapping[str, Any]], name: str, field: str) -> str:
    """Compute the string a ``${data.<name>.<field>}`` placeholder resolves to."""
    data = generate(specs, name)
    if field == "size":
        return str(len(data))
    if field == "md5":
        return hashlib.md5(data).hexdigest()
    if field == "etag":
        return f'"{hashlib.md5(data).hexdigest()}"'
    if field == "sha256":
        return hashlib.sha256(data).hexdigest()
    if field == "sha256B64":
        return base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")
    if field == "sha1B64":
        return base64.b64encode(hashlib.sha1(data).digest()).decode("ascii")
    if field == "crc32B64":
        return base64.b64encode(struct.pack(">I", zlib.crc32(data) & 0xFFFFFFFF)).decode("ascii")
    if field == "crc32cB64":
        return base64.b64encode(struct.pack(">I", _crc32c(data))).decode("ascii")
    if field == "crc64nvmeB64":
        return base64.b64encode(struct.pack(">Q", _crc64nvme(data))).decode("ascii")
    raise KeyError(f"unknown derived data field: {field}")
