"""TypedDicts for the vector model.

Matcher-valued spots stay ``Any``: their evaluation semantics are defined in the
repository README and belong to runners, not this package.
"""

from __future__ import annotations

from typing import Any, Literal, Required, TypedDict, Union

Matcher = Union[str, int, float, bool, None, list["Matcher"], dict[str, Any]]
ContentDescriptor = Union[str, dict[str, str]]  # "text" | {"$data": name} | {"$base64": b64}


class BucketPrerequisite(TypedDict, total=False):
    handle: Required[str]
    versioning: Literal["Enabled", "Suspended"]
    objectLock: bool


class ObjectPrerequisite(TypedDict, total=False):
    handle: Required[str]
    bucket: Required[str]
    key: Required[str]
    body: ContentDescriptor
    contentType: str
    metadata: dict[str, str]


class CredentialPrerequisite(TypedDict):
    handle: str


# Keyed unions: exactly one $-prefixed key per object ($-keys are invalid
# Python identifiers, hence the functional TypedDict syntax).
BucketPrerequisiteWrapper = TypedDict("BucketPrerequisiteWrapper", {"$bucket": BucketPrerequisite})
ObjectPrerequisiteWrapper = TypedDict("ObjectPrerequisiteWrapper", {"$object": ObjectPrerequisite})
CredentialPrerequisiteWrapper = TypedDict(
    "CredentialPrerequisiteWrapper", {"$credential": CredentialPrerequisite}
)

Prerequisite = Union[
    BucketPrerequisiteWrapper, ObjectPrerequisiteWrapper, CredentialPrerequisiteWrapper
]


class PrngData(TypedDict):
    seed: str
    size: int


class PatternData(TypedDict, total=False):
    pattern: str
    patternBase64: str
    size: Required[int]


class SliceData(TypedDict):
    of: str
    offset: int
    length: int


PrngSpecWrapper = TypedDict("PrngSpecWrapper", {"$prng": PrngData})
PatternSpecWrapper = TypedDict("PatternSpecWrapper", {"$pattern": PatternData})
SliceSpecWrapper = TypedDict("SliceSpecWrapper", {"$slice": SliceData})

DataSpec = Union[PrngSpecWrapper, PatternSpecWrapper, SliceSpecWrapper]


class Expect(TypedDict, total=False):
    status: int
    error: Union[str, dict[str, Any]]
    headers: dict[str, Matcher]
    response: dict[str, Matcher]
    body: Any


class Presign(TypedDict):
    expiresIn: int


class OperationStep(TypedDict, total=False):
    name: Required[str]
    params: dict[str, Any]
    identity: str
    presign: Presign
    capture: dict[str, str]
    expect: Expect


class HttpStep(TypedDict, total=False):
    method: Required[str]
    path: Required[str]
    query: dict[str, Union[str, list[str]]]
    headers: dict[str, Union[str, list[str]]]
    body: ContentDescriptor
    sign: bool
    identity: str
    capture: dict[str, str]
    expect: Expect


# Keyed union: a step object has exactly one of the keys "$operation" / "$http"
# ($-prefixed keys are invalid Python identifiers, hence the functional syntax).
OperationStepWrapper = TypedDict("OperationStepWrapper", {"$operation": OperationStep})
HttpStepWrapper = TypedDict("HttpStepWrapper", {"$http": HttpStep})

Step = Union[OperationStepWrapper, HttpStepWrapper]


class ApiVector(TypedDict, total=False):
    id: Required[str]
    kind: Required[Literal["api"]]
    title: Required[str]
    description: str
    tags: Required[list[str]]
    source: str
    prerequisites: list[Prerequisite]
    data: dict[str, DataSpec]
    steps: Required[list[Step]]


class SigningRequest(TypedDict, total=False):
    method: Required[str]
    uri: Required[str]
    headers: Required[list[list[str]]]  # ordered [name, value] pairs
    body: str


class Credentials(TypedDict, total=False):
    accessKeyId: Required[str]
    secretAccessKey: Required[str]
    sessionToken: str


class Scope(TypedDict):
    dateTime: str
    region: str
    service: str


class SigningExpect(TypedDict, total=False):
    canonicalRequest: str
    stringToSign: str
    authorization: Required[str]
    signedRequest: str


class SigningVector(TypedDict, total=False):
    id: Required[str]
    kind: Required[Literal["signing"]]
    title: Required[str]
    description: str
    tags: Required[list[str]]
    source: str
    request: Required[SigningRequest]
    credentials: Required[Credentials]
    scope: Required[Scope]
    expect: Required[SigningExpect]


Vector = Union[ApiVector, SigningVector]


class VectorFile(TypedDict, total=False):
    area: Required[str]
    vectors: Required[list[Vector]]


class AreaInfo(TypedDict):
    area: str
    file: str
    count: int


class Manifest(TypedDict):
    version: str
    total: int
    schemaSha256: str
    areas: list[AreaInfo]
