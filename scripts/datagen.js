// Reference implementation of the vector generated-data algorithm and its
// derived digest values. Normative prose lives in README.md ("Generated data").
//
// Usage:
//   node scripts/datagen.js --self-test
//   (also required as a module by scripts/validate.js)

'use strict'

const crypto = require('node:crypto')

// --- generation -------------------------------------------------------------

// block(i) = SHA256(UTF8(seed) || BE64(i)); stream = block(0) || block(1) || ...
function prng (seed, size) {
  const out = Buffer.alloc(size)
  const seedBytes = Buffer.from(seed, 'utf8')
  const counter = Buffer.alloc(8)
  for (let off = 0, i = 0; off < size; off += 32, i++) {
    counter.writeBigUInt64BE(BigInt(i))
    const block = crypto.createHash('sha256').update(seedBytes).update(counter).digest()
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

// Materialize one named dataset from a vector's `data` map.
function generate (specs, name) {
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

// --- checksums ---------------------------------------------------------------

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

// --- derived values (the ${data.<name>.<field>} placeholders) ----------------

const DERIVED_FIELDS = [
  'size', 'md5', 'etag', 'sha256', 'sha256B64', 'sha1B64', 'crc32B64', 'crc32cB64', 'crc64nvmeB64'
]

function derived (specs, name, field) {
  const bytes = generate(specs, name)
  switch (field) {
    case 'size': return String(bytes.length)
    case 'md5': return crypto.createHash('md5').update(bytes).digest('hex')
    case 'etag': return `"${crypto.createHash('md5').update(bytes).digest('hex')}"`
    case 'sha256': return crypto.createHash('sha256').update(bytes).digest('hex')
    case 'sha256B64': return crypto.createHash('sha256').update(bytes).digest('base64')
    case 'sha1B64': return crypto.createHash('sha1').update(bytes).digest('base64')
    case 'crc32B64': return u32ToBase64(crc32(bytes, CRC32_TABLE))
    case 'crc32cB64': return u32ToBase64(crc32(bytes, CRC32C_TABLE))
    case 'crc64nvmeB64': return u64ToBase64(crc64nvme(bytes))
    default: throw new Error(`unknown derived data field: ${field}`)
  }
}

module.exports = { generate, derived, DERIVED_FIELDS }

// --- self-test ----------------------------------------------------------------

function selfTest () {
  const assert = require('node:assert')

  // prng blocks cross-checked against `printf 'test\0...' | shasum -a 256`
  const specs = {
    t40: { kind: 'prng', seed: 'test', size: 40 },
    t32: { kind: 'prng', seed: 'test', size: 32 },
    t10: { kind: 'prng', seed: 'test', size: 10 },
    aaa: { kind: 'pattern', pattern: 'A', size: 5 },
    abc: { kind: 'pattern', pattern: 'abc', size: 8 },
    bin: { kind: 'pattern', patternBase64: '3q2+7w==', size: 6 },
    sl: { kind: 'slice', of: 't40', offset: 30, length: 6 }
  }
  const block0 = 'b8cc3d1fcf7818feab07f224263256110eeb3b576a94ef8e7e439b48fc77998b'
  const block1 = '64a3a04c326aae7efd121f8468df1ac90ead2ece1e952353903cbcb6ae47618d'
  assert.strictEqual(generate(specs, 't32').toString('hex'), block0)
  assert.strictEqual(generate(specs, 't40').toString('hex'), block0 + block1.slice(0, 16))
  assert.strictEqual(generate(specs, 't10').toString('hex'), block0.slice(0, 20))
  assert.strictEqual(generate(specs, 'aaa').toString('utf8'), 'AAAAA')
  assert.strictEqual(generate(specs, 'abc').toString('utf8'), 'abcabcab')
  assert.strictEqual(generate(specs, 'bin').toString('hex'), 'deadbeefdead')
  assert.strictEqual(generate(specs, 'sl').toString('hex'), (block0 + block1.slice(0, 16)).slice(60, 72))

  // Standard CRC check values for the ASCII string "123456789".
  const check = Buffer.from('123456789', 'ascii')
  assert.strictEqual(crc32(check, CRC32_TABLE).toString(16), 'cbf43926')
  assert.strictEqual(crc32(check, CRC32C_TABLE).toString(16), 'e3069283')
  assert.strictEqual(crc64nvme(check).toString(16), 'ae8b14860a799888')

  // Derived values: MD5("AAAAA") etc. computed independently.
  assert.strictEqual(derived(specs, 'aaa', 'md5'), 'f6a6263167c92de8644ac998b3c4e4d1')
  assert.strictEqual(derived(specs, 'aaa', 'etag'), '"f6a6263167c92de8644ac998b3c4e4d1"')
  assert.strictEqual(derived(specs, 'aaa', 'size'), '5')
  for (const f of DERIVED_FIELDS) derived(specs, 'sl', f) // all fields derivable on slices

  console.log('datagen self-test: OK')
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    console.error('usage: node scripts/datagen.js --self-test')
    process.exit(1)
  }
}
