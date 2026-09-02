package s3vectors

import (
	"encoding/json"
	"fmt"
)

// VectorFile is one feature group's vectors.
type VectorFile struct {
	Schema  string   `json:"$schema,omitempty"`
	Vectors []Vector `json:"vectors"`
}

// Vector is a single test vector, discriminated by Kind ("api" or "signing").
// Fields below the Kind comment lines are only populated for that kind.
type Vector struct {
	ID          string   `json:"id"`
	Group       string   `json:"group"`
	Kind        string   `json:"kind"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Tags        []string `json:"tags"`
	Source      string   `json:"source,omitempty"`

	// kind == "api"
	Prerequisites []Prerequisite      `json:"prerequisites,omitempty"`
	Data          map[string]DataSpec `json:"data,omitempty"`
	Steps         []Step              `json:"steps,omitempty"`

	// kind == "signing"
	Request     *SigningRequest `json:"request,omitempty"`
	Credentials *Credentials    `json:"credentials,omitempty"`
	Scope       *Scope          `json:"scope,omitempty"`
	Expect      *SigningExpect  `json:"expect,omitempty"`
}

// IsAPI reports whether this is a server round-trip vector.
func (v *Vector) IsAPI() bool { return v.Kind == "api" }

// IsSigning reports whether this is an offline SigV4 signing vector.
func (v *Vector) IsSigning() bool { return v.Kind == "signing" }

// Prerequisite is a condition the runner must establish before step 1: a keyed
// union with exactly one of Bucket ($bucket), Object ($object) or
// Credential ($credential) set.
type Prerequisite struct {
	Bucket     *BucketPrerequisite     `json:"$bucket,omitempty"`
	Object     *ObjectPrerequisite     `json:"$object,omitempty"`
	Credential *CredentialPrerequisite `json:"$credential,omitempty"`
}

// Handle returns the prerequisite's resource handle.
func (p *Prerequisite) Handle() string {
	switch {
	case p.Bucket != nil:
		return p.Bucket.Handle
	case p.Object != nil:
		return p.Object.Handle
	case p.Credential != nil:
		return p.Credential.Handle
	}
	return ""
}

// BucketPrerequisite provisions a bucket; its runner-chosen name is
// ${res.<handle>.name}.
type BucketPrerequisite struct {
	Handle     string `json:"handle"`
	Versioning string `json:"versioning,omitempty"`
	ObjectLock *bool  `json:"objectLock,omitempty"`
}

// ObjectPrerequisite seeds an object into a $bucket prerequisite.
type ObjectPrerequisite struct {
	Handle      string            `json:"handle"`
	Bucket      string            `json:"bucket"`
	Key         string            `json:"key"`
	Body        json.RawMessage   `json:"body,omitempty"` // content descriptor
	ContentType string            `json:"contentType,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

// CredentialPrerequisite provisions a second, distinct identity.
type CredentialPrerequisite struct {
	Handle string `json:"handle"`
}

// DataSpec declares a deterministic dataset: a keyed union with exactly one of
// Prng ($prng), Pattern ($pattern) or Slice ($slice) set.
type DataSpec struct {
	Prng    *PrngData    `json:"$prng,omitempty"`
	Pattern *PatternData `json:"$pattern,omitempty"`
	Slice   *SliceData   `json:"$slice,omitempty"`
}

// PrngData is SHA-256 counter-mode data: block(i) = SHA256(UTF8(seed) || BE64(i)).
type PrngData struct {
	Seed string `json:"seed"`
	Size int64  `json:"size"`
}

// PatternData repeats the pattern bytes (exactly one of Pattern /
// PatternBase64), truncated to Size.
type PatternData struct {
	Pattern       *string `json:"pattern,omitempty"`
	PatternBase64 *string `json:"patternBase64,omitempty"`
	Size          int64   `json:"size"`
}

// SliceData is a byte range [Offset, Offset+Length) of a $prng/$pattern dataset.
type SliceData struct {
	Of     string `json:"of"`
	Offset int64  `json:"offset"`
	Length int64  `json:"length"`
}

// Step is one request/response step: a keyed union with exactly one of
// Operation ($operation, an S3 API operation by name) or HTTP ($http, a raw
// wire-level request) set.
type Step struct {
	Operation *OperationStep `json:"$operation,omitempty"`
	HTTP      *HTTPStep      `json:"$http,omitempty"`
}

// IsHTTP reports whether this is a raw-HTTP step.
func (s *Step) IsHTTP() bool { return s.HTTP != nil }

// OperationStep is an S3 API operation by name with API-model member names as
// params. A nil Expect means the step must simply succeed.
type OperationStep struct {
	Name     string                     `json:"name"`
	Params   map[string]json.RawMessage `json:"params,omitempty"` // values may be content descriptors
	Identity string                     `json:"identity,omitempty"`
	Presign  *Presign                   `json:"presign,omitempty"`
	Capture  map[string]string          `json:"capture,omitempty"`
	Expect   *Expect                    `json:"expect,omitempty"`
}

// Presign instructs the runner to execute the operation via a presigned URL.
type Presign struct {
	ExpiresIn int `json:"expiresIn"`
}

// HTTPStep is a raw request for wire-level tests.
type HTTPStep struct {
	Method   string               `json:"method"`
	Path     string               `json:"path"`
	Query    map[string]OneOrMany `json:"query,omitempty"`
	Headers  map[string]OneOrMany `json:"headers,omitempty"`
	Body     json.RawMessage      `json:"body,omitempty"` // content descriptor
	Sign     *bool                `json:"sign,omitempty"` // nil => default true
	Identity string               `json:"identity,omitempty"`
	Capture  map[string]string    `json:"capture,omitempty"`
	Expect   *Expect              `json:"expect,omitempty"`
}

// OneOrMany decodes a JSON string or array of strings.
type OneOrMany []string

// UnmarshalJSON implements json.Unmarshaler.
func (o *OneOrMany) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*o = OneOrMany{s}
		return nil
	}
	var many []string
	if err := json.Unmarshal(b, &many); err != nil {
		return fmt.Errorf("expected string or string array: %w", err)
	}
	*o = many
	return nil
}

// Expect holds a step's assertions. Matcher-valued fields are kept raw; matcher
// semantics are defined in the repository README and evaluated by runners.
type Expect struct {
	Status   int                        `json:"status,omitempty"`
	Error    json.RawMessage            `json:"error,omitempty"`    // string | {code, message: matcher}
	Headers  map[string]json.RawMessage `json:"headers,omitempty"`  // lowercase name -> matcher
	Response json.RawMessage            `json:"response,omitempty"` // subset object
	Body     json.RawMessage            `json:"body,omitempty"`     // content descriptor | digest assertion
}

// SigningRequest is the request-to-sign of a signing vector. Headers are
// ordered [name, value] pairs: duplicates and folded values are under test.
type SigningRequest struct {
	Method  string      `json:"method"`
	URI     string      `json:"uri"` // raw, un-normalized request-target
	Headers [][2]string `json:"headers"`
	Body    string      `json:"body,omitempty"`
}

// Credentials are the published AWS SigV4 test-suite dummy values — public
// documentation constants, never real secrets.
type Credentials struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	SessionToken    string `json:"sessionToken,omitempty"`
}

// Scope is the SigV4 credential scope.
type Scope struct {
	DateTime string `json:"dateTime"`
	Region   string `json:"region"`
	Service  string `json:"service"`
}

// SigningExpect holds the expected outputs of each signing stage.
type SigningExpect struct {
	CanonicalRequest string `json:"canonicalRequest,omitempty"`
	StringToSign     string `json:"stringToSign,omitempty"`
	Authorization    string `json:"authorization"`
	SignedRequest    string `json:"signedRequest,omitempty"`
}

// ManifestInfo describes the embedded corpus snapshot.
type ManifestInfo struct {
	Version      string      `json:"version"`
	Total        int         `json:"total"`
	SchemaSHA256 string      `json:"schemaSha256"`
	Groups       []GroupInfo `json:"groups"`
}

// GroupInfo is one group's manifest entry.
type GroupInfo struct {
	Group string `json:"group"`
	File  string `json:"file"`
	Count int    `json:"count"`
}
