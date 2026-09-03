/** S3 compatibility test vectors. Normative semantics (placeholders, matchers,
 * generated data, runner outcomes) are defined in the repository README:
 * https://github.com/cloud-portable/s3vectors */

// ---------------------------------------------------------------------------
// Vector model
// ---------------------------------------------------------------------------

export type Vector = ApiVector | SigningVector

export interface ApiVector {
  id: string
  kind: 'api'
  title: string
  description?: string
  /** Includes exactly one tier tag: 'tier-1' | 'tier-2' | 'tier-3'. */
  tags: string[]
  /** Permalink to the test this vector was converted from. */
  source?: string
  prerequisites?: Prerequisite[]
  /** Named deterministic datasets; see the datagen module. */
  data?: Record<string, DataSpec>
  steps: Step[]
}

export interface SigningVector {
  id: string
  kind: 'signing'
  title: string
  description?: string
  tags: string[]
  source?: string
  request: SigningRequest
  /** Published AWS SigV4 test-suite dummy credentials — public constants, never real secrets. */
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
  scope: { dateTime: string; region: string; service: string }
  expect: {
    canonicalRequest?: string
    stringToSign?: string
    authorization: string
    signedRequest?: string
  }
}

export interface SigningRequest {
  method: string
  /** Raw, un-normalized request-target (path normalization is under test). */
  uri: string
  /** Ordered [name, value] pairs; duplicates and obs-fold values preserved. */
  headers: [string, string][]
  body?: string
}

export type Prerequisite = BucketPrerequisite | ObjectPrerequisite | CredentialPrerequisite

export interface BucketPrerequisite {
  type: 'bucket'
  handle: string
  versioning?: 'Enabled' | 'Suspended'
  objectLock?: boolean
}

export interface ObjectPrerequisite {
  type: 'object'
  handle: string
  /** Handle of a bucket prerequisite in the same vector. */
  bucket: string
  key: string
  body?: ContentDescriptor
  contentType?: string
  metadata?: Record<string, string>
}

export interface CredentialPrerequisite {
  type: 'credential'
  handle: string
}

export type DataSpec = PrngData | PatternData | SliceData

/** SHA-256 counter mode: block(i) = SHA256(UTF8(seed) || BE64(i)). */
export interface PrngData { kind: 'prng'; seed: string; size: number }
/** Pattern bytes repeated and truncated to size (exactly one of pattern | patternBase64). */
export interface PatternData { kind: 'pattern'; pattern?: string; patternBase64?: string; size: number }
/** Byte range [offset, offset+length) of a prng/pattern dataset. */
export interface SliceData { kind: 'slice'; of: string; offset: number; length: number }

export type ContentDescriptor = string | { $data: string } | { $base64: string }

export type Step = OperationStep | HttpStep

export interface OperationStep {
  /** Exact AWS S3 API operation name. */
  operation: string
  /** AWS API model member names; string values may contain ${...} placeholders. */
  params?: Record<string, unknown>
  identity?: string
  /** Execute via a runner-minted presigned URL fetched unsigned. */
  presign?: { expiresIn: number }
  capture?: Record<string, string>
  expect?: Expect
}

export interface HttpStep {
  http: {
    method: string
    path: string
    query?: Record<string, string | string[]>
    headers?: Record<string, string | string[]>
    body?: ContentDescriptor
  }
  /** Default true: runner SigV4-signs with the step identity. false: send byte-literal. */
  sign?: boolean
  identity?: string
  capture?: Record<string, string>
  expect?: Expect
}

export interface Expect {
  status?: number
  error?: string | { code: string; message?: Matcher }
  /** Lowercase header name -> matcher. */
  headers?: Record<string, Matcher>
  /** Operation steps only: subset match against the parsed API-model response. */
  response?: SubsetObject
  body?: BodyExpect
}

/** Scalar = exact; array = exact length + ordered match; object with all keys
 * $-prefixed = assertion; other object = recursive subset match. */
export type Matcher = string | number | boolean | null | Matcher[] | AssertionObject | SubsetObject

export interface AssertionObject {
  $exists?: true
  $absent?: true
  $eq?: unknown
  $matches?: string
  $length?: number
  $contains?: Matcher
}

export interface SubsetObject { [field: string]: Matcher }

export type BodyExpect = ContentDescriptor | { $size?: number; $md5?: string; $sha256?: string }

// ---------------------------------------------------------------------------
// Package API
// ---------------------------------------------------------------------------

export interface VectorFile {
  $schema?: string
  area: string
  vectors: Vector[]
}

export interface Manifest {
  /** Corpus snapshot version (equals the package version). */
  version: string
  total: number
  schemaSha256: string
  areas: { area: string; file: string; count: number }[]
}

export const manifest: Manifest
/** Area names, in manifest order. */
export const areas: readonly string[]
/** Load one area's vectors. Lazy; parsed once and cached. Throws on unknown area. */
export function load (area: string): VectorFile
/** Load every area, in manifest order. */
export function all (): VectorFile[]
