// Package s3vectors embeds the cloud-portable S3 API compatibility test-vector
// corpus and exposes it parsed, per feature area or all at once.
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

// Manifest describes the embedded corpus snapshot (version, totals, areas).
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

// Areas returns the area names in manifest order.
func Areas() []string {
	m := Manifest()
	names := make([]string, len(m.Areas))
	for i, a := range m.Areas {
		names[i] = a.Area
	}
	return names
}

// Area returns one area's vectors. Lazy; parsed once and cached (read-only).
func Area(name string) (*VectorFile, error) {
	mu.Lock()
	defer mu.Unlock()
	if f, ok := cache[name]; ok {
		return f, nil
	}
	var entry *AreaInfo
	m := Manifest()
	for i := range m.Areas {
		if m.Areas[i].Area == name {
			entry = &m.Areas[i]
			break
		}
	}
	if entry == nil {
		return nil, fmt.Errorf("s3vectors: unknown area %q", name)
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

// All returns every area's vectors in manifest order.
func All() ([]*VectorFile, error) {
	m := Manifest()
	out := make([]*VectorFile, 0, len(m.Areas))
	for _, a := range m.Areas {
		f, err := Area(a.Area)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, nil
}
