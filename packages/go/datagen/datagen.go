// Package datagen is the Go port of the vector generated-data reference:
// it materializes a vector's named datasets and computes the derived digest
// strings that ${data.<name>.<field>} placeholders resolve to.
package datagen

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"hash/crc32"
	"hash/crc64"
	"strconv"

	s3vectors "github.com/alanshaw/s3vectors/packages/go"
)

// DerivedFields lists the fields available as ${data.<name>.<field>} placeholders.
var DerivedFields = []string{
	"size", "md5", "etag", "sha256", "sha256B64", "sha1B64", "crc32B64", "crc32cB64", "crc64nvmeB64",
}

var (
	crc32cTable = crc32.MakeTable(crc32.Castagnoli)
	// CRC-64/NVME reflected polynomial; Go's crc64 applies the all-ones
	// init/xorout of the NVME parameterization internally.
	crc64Table = crc64.MakeTable(0x9A6C9329AC4BC9B5)
)

// block(i) = SHA256(UTF8(seed) || BE64(i)); stream = block(0) || block(1) || ...
func prng(seed string, size int64) []byte {
	out := make([]byte, size)
	seedBytes := []byte(seed)
	var counter [8]byte
	for off, i := int64(0), uint64(0); off < size; off, i = off+32, i+1 {
		binary.BigEndian.PutUint64(counter[:], i)
		h := sha256.New()
		h.Write(seedBytes)
		h.Write(counter[:])
		copy(out[off:], h.Sum(nil))
	}
	return out
}

func pattern(patternBytes []byte, size int64) ([]byte, error) {
	if len(patternBytes) == 0 {
		return nil, fmt.Errorf("empty pattern")
	}
	out := make([]byte, size)
	for off := int64(0); off < size; off += int64(len(patternBytes)) {
		copy(out[off:], patternBytes)
	}
	return out, nil
}

// Generate materializes one named dataset from a vector's data map.
func Generate(specs map[string]s3vectors.DataSpec, name string) ([]byte, error) {
	spec, ok := specs[name]
	if !ok {
		return nil, fmt.Errorf("unknown dataset: %s", name)
	}
	switch {
	case spec.Prng != nil:
		return prng(spec.Prng.Seed, spec.Prng.Size), nil
	case spec.Pattern != nil:
		d := spec.Pattern
		if d.Pattern != nil {
			return pattern([]byte(*d.Pattern), d.Size)
		}
		raw, err := base64.StdEncoding.DecodeString(*d.PatternBase64)
		if err != nil {
			return nil, fmt.Errorf("dataset %s: bad patternBase64: %w", name, err)
		}
		return pattern(raw, d.Size)
	case spec.Slice != nil:
		d := spec.Slice
		parent, ok := specs[d.Of]
		if !ok {
			return nil, fmt.Errorf("slice %q references unknown dataset %q", name, d.Of)
		}
		if parent.Slice != nil {
			return nil, fmt.Errorf("slice %q references slice %q (chained slices are not allowed)", name, d.Of)
		}
		base, err := Generate(specs, d.Of)
		if err != nil {
			return nil, err
		}
		if d.Offset+d.Length > int64(len(base)) {
			return nil, fmt.Errorf("slice %q [%d, %d) exceeds %q size %d",
				name, d.Offset, d.Offset+d.Length, d.Of, len(base))
		}
		return base[d.Offset : d.Offset+d.Length], nil
	default:
		return nil, fmt.Errorf("dataset %s: no $prng/$pattern/$slice key", name)
	}
}

// Derived computes the string a ${data.<name>.<field>} placeholder resolves to.
func Derived(specs map[string]s3vectors.DataSpec, name, field string) (string, error) {
	bytes, err := Generate(specs, name)
	if err != nil {
		return "", err
	}
	switch field {
	case "size":
		return strconv.Itoa(len(bytes)), nil
	case "md5":
		sum := md5.Sum(bytes)
		return hex.EncodeToString(sum[:]), nil
	case "etag":
		sum := md5.Sum(bytes)
		return `"` + hex.EncodeToString(sum[:]) + `"`, nil
	case "sha256":
		sum := sha256.Sum256(bytes)
		return hex.EncodeToString(sum[:]), nil
	case "sha256B64":
		sum := sha256.Sum256(bytes)
		return base64.StdEncoding.EncodeToString(sum[:]), nil
	case "sha1B64":
		sum := sha1.Sum(bytes)
		return base64.StdEncoding.EncodeToString(sum[:]), nil
	case "crc32B64":
		var b [4]byte
		binary.BigEndian.PutUint32(b[:], crc32.ChecksumIEEE(bytes))
		return base64.StdEncoding.EncodeToString(b[:]), nil
	case "crc32cB64":
		var b [4]byte
		binary.BigEndian.PutUint32(b[:], crc32.Checksum(bytes, crc32cTable))
		return base64.StdEncoding.EncodeToString(b[:]), nil
	case "crc64nvmeB64":
		var b [8]byte
		binary.BigEndian.PutUint64(b[:], crc64.Checksum(bytes, crc64Table))
		return base64.StdEncoding.EncodeToString(b[:]), nil
	default:
		return "", fmt.Errorf("unknown derived data field: %s", field)
	}
}
