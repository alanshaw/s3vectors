package s3vectors

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
	"testing"
)

func TestManifestAgreement(t *testing.T) {
	m := Manifest()
	if m.Version == "" || m.Total == 0 || len(m.Areas) == 0 {
		t.Fatalf("manifest incomplete: %+v", m)
	}
	total := 0
	for _, entry := range m.Areas {
		f, err := Area(entry.Area)
		if err != nil {
			t.Fatalf("Area(%q): %v", entry.Area, err)
		}
		if f.Area != entry.Area {
			t.Errorf("area mismatch: %q != %q", f.Area, entry.Area)
		}
		if len(f.Vectors) != entry.Count {
			t.Errorf("%s: %d vectors, manifest says %d", entry.Area, len(f.Vectors), entry.Count)
		}
		total += len(f.Vectors)
	}
	if total != m.Total {
		t.Errorf("total %d != manifest total %d", total, m.Total)
	}
	if _, err := Area("no-such-area"); err == nil {
		t.Error("Area(no-such-area) should error")
	}
}

func TestRootEqualsUnionOfAreas(t *testing.T) {
	all, err := All()
	if err != nil {
		t.Fatal(err)
	}
	names := Areas()
	if len(all) != len(names) {
		t.Fatalf("All() %d files, Areas() %d names", len(all), len(names))
	}
	ids := map[string]bool{}
	for i, f := range all {
		if f.Area != names[i] {
			t.Errorf("order mismatch at %d: %q != %q", i, f.Area, names[i])
		}
		for _, v := range f.Vectors {
			if ids[v.ID] {
				t.Errorf("duplicate id %s", v.ID)
			}
			ids[v.ID] = true
			if !strings.HasPrefix(v.ID, f.Area+"-") {
				t.Errorf("%s not prefixed with %s", v.ID, f.Area)
			}
		}
	}
	if len(ids) != Manifest().Total {
		t.Errorf("%d unique ids != manifest total %d", len(ids), Manifest().Total)
	}
}

var tierRe = regexp.MustCompile(`^tier-[123]$`)

func TestVectorShapeSmoke(t *testing.T) {
	all, err := All()
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range all {
		for i := range f.Vectors {
			v := &f.Vectors[i]
			if !v.IsAPI() && !v.IsSigning() {
				t.Errorf("%s: kind %q", v.ID, v.Kind)
			}
			if v.Title == "" {
				t.Errorf("%s: empty title", v.ID)
			}
			tiers := 0
			for _, tag := range v.Tags {
				if tierRe.MatchString(tag) {
					tiers++
				}
			}
			if tiers != 1 {
				t.Errorf("%s: %d tier tags", v.ID, tiers)
			}
			if v.IsAPI() {
				if len(v.Steps) == 0 {
					t.Errorf("%s: no steps", v.ID)
				}
				for j := range v.Steps {
					s := &v.Steps[j]
					if (s.Operation != nil) == (s.HTTP != nil) {
						t.Errorf("%s step %d: must have exactly one of $operation/$http", v.ID, j+1)
					}
					if s.Operation != nil && s.Operation.Name == "" {
						t.Errorf("%s step %d: $operation missing name", v.ID, j+1)
					}
				}
				for j := range v.Prerequisites {
					p := &v.Prerequisites[j]
					set := 0
					for _, present := range []bool{p.Bucket != nil, p.Object != nil, p.Credential != nil} {
						if present {
							set++
						}
					}
					if set != 1 || p.Handle() == "" {
						t.Errorf("%s prerequisite %d: must have exactly one union key with a handle", v.ID, j+1)
					}
				}
				for name, d := range v.Data {
					set := 0
					for _, present := range []bool{d.Prng != nil, d.Pattern != nil, d.Slice != nil} {
						if present {
							set++
						}
					}
					if set != 1 {
						t.Errorf("%s data %s: must have exactly one union key", v.ID, name)
					}
				}
			} else if v.Expect == nil || v.Expect.Authorization == "" {
				t.Errorf("%s: missing expect.authorization", v.ID)
			}
		}
	}
}

// Strict decode of every embedded file: unknown JSON fields mean the Go model
// has drifted from the corpus/schema.
func TestStrictDecode(t *testing.T) {
	for _, entry := range Manifest().Areas {
		raw, err := files.ReadFile("vectors/" + entry.File)
		if err != nil {
			t.Fatal(err)
		}
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.DisallowUnknownFields()
		var f VectorFile
		if err := dec.Decode(&f); err != nil {
			t.Errorf("%s: strict decode: %v", entry.File, err)
		}
	}
}
