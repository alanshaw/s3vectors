// Package s3vectors embeds the cloud-portable S3 API compatibility test-vector
// corpus and exposes it parsed, per feature group or all at once.
//
// Normative semantics (placeholder grammar, matcher semantics, generated data,
// runner outcomes) are defined in the repository README:
// https://github.com/cloud-portable/s3vectors
//
// Returned *VectorFile values are parsed once, cached and shared: treat them
// as read-only.
package s3vectors

import (
	"embed"
	"encoding/json"
	"fmt"
	"sync"
)

//go:embed vectors/*.json
var files embed.FS

var (
	manifestOnce sync.Once
	manifest     ManifestInfo

	mu    sync.Mutex
	cache = map[string]*VectorFile{}
)

// Manifest describes the embedded corpus snapshot (version, totals, groups).
func Manifest() ManifestInfo {
	manifestOnce.Do(func() {
		raw, err := files.ReadFile("vectors/manifest.json")
		if err != nil {
			panic("s3vectors: embedded manifest missing: " + err.Error())
		}
		if err := json.Unmarshal(raw, &manifest); err != nil {
			panic("s3vectors: embedded manifest invalid: " + err.Error())
		}
	})
	return manifest
}

// Groups returns the group names in manifest order.
func Groups() []string {
	m := Manifest()
	names := make([]string, len(m.Groups))
	for i, g := range m.Groups {
		names[i] = g.Group
	}
	return names
}

// Group returns one group's vectors. Lazy; parsed once and cached (read-only).
func Group(name string) (*VectorFile, error) {
	mu.Lock()
	defer mu.Unlock()
	if f, ok := cache[name]; ok {
		return f, nil
	}
	var entry *GroupInfo
	m := Manifest()
	for i := range m.Groups {
		if m.Groups[i].Group == name {
			entry = &m.Groups[i]
			break
		}
	}
	if entry == nil {
		return nil, fmt.Errorf("s3vectors: unknown group %q", name)
	}
	raw, err := files.ReadFile("vectors/" + entry.File)
	if err != nil {
		return nil, fmt.Errorf("s3vectors: read %s: %w", entry.File, err)
	}
	f := new(VectorFile)
	if err := json.Unmarshal(raw, f); err != nil {
		return nil, fmt.Errorf("s3vectors: parse %s: %w", entry.File, err)
	}
	cache[name] = f
	return f, nil
}

// All returns every group's vectors in manifest order.
func All() ([]*VectorFile, error) {
	m := Manifest()
	out := make([]*VectorFile, 0, len(m.Groups))
	for _, g := range m.Groups {
		f, err := Group(g.Group)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, nil
}
