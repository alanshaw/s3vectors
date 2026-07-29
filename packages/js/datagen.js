// Reference implementation of the vector generated-data algorithm and its
// derived digest values. Normative prose: the repository README, "Generated data".
import { createHash } from 'node:crypto'

// block(i) = SHA256(UTF8(seed) || BE64(i)); stream = block(0) || block(1) || ...
function prng (seed, size) {
  const out = Buffer.alloc(size)
  const seeded = createHash('sha256').update(Buffer.from(seed, 'utf8'))
  const counter = Buffer.alloc(8)
  for (let off = 0, i = 0n; off < size; off += 32, i++) {
    counter.writeBigUInt64BE(i)
    const block = seeded.copy().update(counter).digest()
    block.copy(out, off, 0, Math.min(32, size - off))
  }
  return out
}

function pattern (patternBytes, size) {
  if (patternBytes.length === 0) throw new Error('empty pattern')
  const out = Buffer.alloc(size)
  for (let off = 0; off < size; off += patternBytes.length) {
    patternBytes.copy(out, off, 0, Math.min(patternBytes.length, size - off))
  }
  return out
}

/**
 * Materialize one named dataset from a vector's `data` map.
 * @param {Record<string, object>} specs the vector's `data` map
 * @param {string} name
 * @returns {Buffer}
 */
export function generate (specs, name) {
  const spec = specs[name]
  if (!spec) throw new Error(`unknown dataset: ${name}`)
  switch (spec.kind) {
    case 'prng':
      return prng(spec.seed, spec.size)
    case 'pattern':
      return pattern(
        spec.pattern !== undefined ? Buffer.from(spec.pattern, 'utf8') : Buffer.from(spec.patternBase64, 'base64'),
        spec.size
      )
    case 'slice': {
      const parent = specs[spec.of]
      if (!parent) throw new Error(`slice '${name}' references unknown dataset '${spec.of}'`)
      if (parent.kind === 'slice') throw new Error(`slice '${name}' references slice '${spec.of}' (chained slices are not allowed)`)
      const base = generate(specs, spec.of)
      if (spec.offset + spec.length > base.length) {
        throw new Error(`slice '${name}' [${spec.offset}, ${spec.offset + spec.length}) exceeds '${spec.of}' size ${base.length}`)
      }
      return base.subarray(spec.offset, spec.offset + spec.length)
    }
    default:
      throw new Error(`unknown data kind: ${spec.kind}`)
  }
}

function makeCrc32Table (poly) {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ poly : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const CRC32_TABLE = makeCrc32Table(0xEDB88320)
const CRC32C_TABLE = makeCrc32Table(0x82F63B78)

function crc32 (buf, table) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// CRC-64/NVME: reflected poly 0x9A6C9329AC4BC9B5, init/xorout all-ones.
const CRC64_TABLE = (() => {
  const poly = 0x9A6C9329AC4BC9B5n
  const table = new BigUint64Array(256)
  for (let n = 0; n < 256; n++) {
    let c = BigInt(n)
    for (let k = 0; k < 8; k++) c = c & 1n ? (c >> 1n) ^ poly : c >> 1n
    table[n] = c
  }
  return table
})()

function crc64nvme (buf) {
  let c = 0xFFFFFFFFFFFFFFFFn
  for (let i = 0; i < buf.length; i++) {
    c = CRC64_TABLE[Number((c ^ BigInt(buf[i])) & 0xFFn)] ^ (c >> 8n)
  }
  return c ^ 0xFFFFFFFFFFFFFFFFn
}

function u32ToBase64 (v) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(v)
  return b.toString('base64')
}

function u64ToBase64 (v) {
  const b = Buffer.alloc(8)
  b.writeBigUInt64BE(v)
  return b.toString('base64')
}

/** The fields available as `${data.<name>.<field>}` placeholders. */
export const DERIVED_FIELDS = Object.freeze([
  'size', 'md5', 'etag', 'sha256', 'sha256B64', 'sha1B64', 'crc32B64', 'crc32cB64', 'crc64nvmeB64'
])

/**
 * Compute a derived string value of a dataset (what a `${data.<name>.<field>}`
 * placeholder resolves to).
 * @param {Record<string, object>} specs the vector's `data` map
 * @param {string} name
 * @param {string} field one of DERIVED_FIELDS
 * @returns {string}
 */
export function derived (specs, name, field) {
  const bytes = generate(specs, name)
  switch (field) {
    case 'size': return String(bytes.length)
    case 'md5': return createHash('md5').update(bytes).digest('hex')
    case 'etag': return `"${createHash('md5').update(bytes).digest('hex')}"`
    case 'sha256': return createHash('sha256').update(bytes).digest('hex')
    case 'sha256B64': return createHash('sha256').update(bytes).digest('base64')
    case 'sha1B64': return createHash('sha1').update(bytes).digest('base64')
    case 'crc32B64': return u32ToBase64(crc32(bytes, CRC32_TABLE))
    case 'crc32cB64': return u32ToBase64(crc32(bytes, CRC32C_TABLE))
    case 'crc64nvmeB64': return u64ToBase64(crc64nvme(bytes))
    default: throw new Error(`unknown derived data field: ${field}`)
  }
}
