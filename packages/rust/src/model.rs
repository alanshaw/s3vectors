//! The vector data model. Strict (`deny_unknown_fields`) everywhere structural,
//! so decoding the embedded corpus doubles as model-drift detection.
//! Matcher-valued spots stay [`serde_json::Value`]: their evaluation semantics
//! belong to runners, not this crate.

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::Value;

/// One feature area's vectors.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VectorFile {
    #[serde(rename = "$schema", default)]
    pub schema: Option<String>,
    pub area: String,
    pub vectors: Vec<Vector>,
}

/// A single test vector: a server round-trip test or an offline SigV4 signing test.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Vector {
    Api(ApiVector),
    Signing(SigningVector),
}

impl Vector {
    pub fn id(&self) -> &str {
        match self {
            Vector::Api(v) => &v.id,
            Vector::Signing(v) => &v.id,
        }
    }

    pub fn title(&self) -> &str {
        match self {
            Vector::Api(v) => &v.title,
            Vector::Signing(v) => &v.title,
        }
    }

    pub fn tags(&self) -> &[String] {
        match self {
            Vector::Api(v) => &v.tags,
            Vector::Signing(v) => &v.tags,
        }
    }
}

/// Single-variant tag pinning `"kind": "api"` (keeps the untagged
/// [`Vector`] decode unambiguous while allowing `deny_unknown_fields`).
#[derive(Debug, Deserialize)]
pub enum ApiKind {
    #[serde(rename = "api")]
    Api,
}

/// Single-variant tag pinning `"kind": "signing"`.
#[derive(Debug, Deserialize)]
pub enum SigningKind {
    #[serde(rename = "signing")]
    Signing,
}

/// A server round-trip test.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApiVector {
    pub id: String,
    pub kind: ApiKind,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    /// Includes exactly one tier tag: `tier-1` | `tier-2` | `tier-3`.
    pub tags: Vec<String>,
    /// Permalink to the test this vector was converted from.
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub prerequisites: Vec<Prerequisite>,
    /// Named deterministic datasets; see the `datagen` module.
    #[serde(default)]
    pub data: Option<BTreeMap<String, DataSpec>>,
    pub steps: Vec<Step>,
}

/// An offline SigV4 signing-algorithm test (from the AWS SigV4 test suite).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SigningVector {
    pub id: String,
    pub kind: SigningKind,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub tags: Vec<String>,
    #[serde(default)]
    pub source: Option<String>,
    pub request: SigningRequest,
    /// Published AWS test-suite dummy credentials — public constants, never real secrets.
    pub credentials: Credentials,
    pub scope: Scope,
    pub expect: SigningExpect,
}

/// The request-to-sign. Headers are ordered `(name, value)` pairs: duplicate
/// keys and folded values are under test, so a map cannot represent them.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SigningRequest {
    pub method: String,
    /// Raw, un-normalized request-target (path normalization is under test).
    pub uri: String,
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Credentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    #[serde(default)]
    pub session_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Scope {
    pub date_time: String,
    pub region: String,
    pub service: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SigningExpect {
    #[serde(default)]
    pub canonical_request: Option<String>,
    #[serde(default)]
    pub string_to_sign: Option<String>,
    pub authorization: String,
    #[serde(default)]
    pub signed_request: Option<String>,
}

/// A condition the runner must establish before step 1.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Prerequisite {
    Bucket(BucketPrerequisite),
    Object(ObjectPrerequisite),
    Credential(CredentialPrerequisite),
}

impl Prerequisite {
    pub fn handle(&self) -> &str {
        match self {
            Prerequisite::Bucket(p) => &p.handle,
            Prerequisite::Object(p) => &p.handle,
            Prerequisite::Credential(p) => &p.handle,
        }
    }
}

#[derive(Debug, Deserialize)]
pub enum BucketType {
    #[serde(rename = "bucket")]
    Bucket,
}

#[derive(Debug, Deserialize)]
pub enum ObjectType {
    #[serde(rename = "object")]
    Object,
}

#[derive(Debug, Deserialize)]
pub enum CredentialType {
    #[serde(rename = "credential")]
    Credential,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct BucketPrerequisite {
    pub r#type: BucketType,
    pub handle: String,
    #[serde(default)]
    pub versioning: Option<String>,
    #[serde(default)]
    pub object_lock: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ObjectPrerequisite {
    pub r#type: ObjectType,
    pub handle: String,
    /// Handle of a bucket prerequisite in the same vector.
    pub bucket: String,
    pub key: String,
    /// Content descriptor.
    #[serde(default)]
    pub body: Option<ContentDescriptor>,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub metadata: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CredentialPrerequisite {
    pub r#type: CredentialType,
    pub handle: String,
}

/// A deterministic dataset declaration.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum DataSpec {
    Prng(PrngData),
    Pattern(PatternData),
    Slice(SliceData),
}

impl DataSpec {
    /// Declared output size for prng/pattern, slice length for slices.
    pub fn size(&self) -> u64 {
        match self {
            DataSpec::Prng(d) => d.size,
            DataSpec::Pattern(d) => d.size,
            DataSpec::Slice(d) => d.length,
        }
    }
}

#[derive(Debug, Deserialize)]
pub enum PrngKind {
    #[serde(rename = "prng")]
    Prng,
}

#[derive(Debug, Deserialize)]
pub enum PatternKind {
    #[serde(rename = "pattern")]
    Pattern,
}

#[derive(Debug, Deserialize)]
pub enum SliceKind {
    #[serde(rename = "slice")]
    Slice,
}

// The single-variant kind enums make Clone derivation awkward; implement
// manually where needed.
impl Clone for PrngKind {
    fn clone(&self) -> Self {
        PrngKind::Prng
    }
}
impl Clone for PatternKind {
    fn clone(&self) -> Self {
        PatternKind::Pattern
    }
}
impl Clone for SliceKind {
    fn clone(&self) -> Self {
        SliceKind::Slice
    }
}

/// SHA-256 counter mode: `block(i) = SHA256(UTF8(seed) || BE64(i))`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrngData {
    pub kind: PrngKind,
    pub seed: String,
    pub size: u64,
}

/// Pattern bytes repeated and truncated to `size` (exactly one of
/// `pattern` / `pattern_base64`).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PatternData {
    pub kind: PatternKind,
    #[serde(default)]
    pub pattern: Option<String>,
    #[serde(default)]
    pub pattern_base64: Option<String>,
    pub size: u64,
}

/// Byte range `[offset, offset+length)` of a prng/pattern dataset.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SliceData {
    pub kind: SliceKind,
    pub of: String,
    pub offset: u64,
    pub length: u64,
}

/// Bytes: a UTF-8 string, a dataset reference, or inline base64.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum ContentDescriptor {
    Text(String),
    Data {
        #[serde(rename = "$data")]
        data: String,
    },
    Base64 {
        #[serde(rename = "$base64")]
        base64: String,
    },
}

/// One request/response step, structurally discriminated.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Step {
    Operation(OperationStep),
    Http(HttpStep),
}

impl Step {
    pub fn expect(&self) -> Option<&Expect> {
        match self {
            Step::Operation(s) => s.expect.as_ref(),
            Step::Http(s) => s.expect.as_ref(),
        }
    }
}

/// An S3 API operation by name, with AWS API-model member names as params.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperationStep {
    /// Exact AWS S3 API operation name.
    pub operation: String,
    /// Values may contain `${...}` placeholders or content descriptors.
    #[serde(default)]
    pub params: Option<BTreeMap<String, Value>>,
    #[serde(default)]
    pub identity: Option<String>,
    /// Execute via a runner-minted presigned URL fetched unsigned.
    #[serde(default)]
    pub presign: Option<Presign>,
    #[serde(default)]
    pub capture: Option<BTreeMap<String, String>>,
    #[serde(default)]
    pub expect: Option<Expect>,
}

/// Raw-HTTP escape hatch for wire-level tests.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HttpStep {
    pub http: HttpRequest,
    /// Default `true`: runner SigV4-signs with the step identity.
    /// `false`: send byte-literal.
    #[serde(default)]
    pub sign: Option<bool>,
    #[serde(default)]
    pub identity: Option<String>,
    #[serde(default)]
    pub capture: Option<BTreeMap<String, String>>,
    #[serde(default)]
    pub expect: Option<Expect>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Presign {
    pub expires_in: u64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HttpRequest {
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub query: Option<BTreeMap<String, OneOrMany>>,
    #[serde(default)]
    pub headers: Option<BTreeMap<String, OneOrMany>>,
    /// Content descriptor.
    #[serde(default)]
    pub body: Option<ContentDescriptor>,
}

/// A JSON string or array of strings (repeated header/query values).
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum OneOrMany {
    One(String),
    Many(Vec<String>),
}

/// A step's assertions. Matcher semantics are the runner's concern.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Expect {
    #[serde(default)]
    pub status: Option<u16>,
    /// `"Code"` or `{ "code": ..., "message": matcher }`.
    #[serde(default)]
    pub error: Option<Value>,
    /// Lowercase header name -> matcher.
    #[serde(default)]
    pub headers: Option<BTreeMap<String, Value>>,
    /// Operation steps only: subset match against the parsed API-model response.
    #[serde(default)]
    pub response: Option<Value>,
    /// Content descriptor or digest assertion.
    #[serde(default)]
    pub body: Option<Value>,
}

/// The embedded corpus snapshot description.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Manifest {
    /// Corpus snapshot version (equals the crate version).
    pub version: String,
    pub total: usize,
    pub schema_sha256: String,
    pub areas: Vec<AreaInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AreaInfo {
    pub area: String,
    pub file: String,
    pub count: usize,
}
