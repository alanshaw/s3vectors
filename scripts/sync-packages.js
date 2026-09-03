// Synchronize the canonical vector corpus into the per-language packages.
//
//   node scripts/sync-packages.js           write mode: copy + stamp
//   node scripts/sync-packages.js --check   verify packages match; exit 1 on drift
//
// Deterministic: output depends only on packages/VERSION, vectors/*.json,
// schema/vector.schema.json and LICENSE.md — no timestamps.
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.join(__dirname, '..')
const CHECK = process.argv.includes('--check')

const DATA_DIRS = [
  'packages/js/data',
  'packages/python/src/cloud_portable_s3vectors/data',
  'packages/go/vectors',
  'packages/rust/vectors'
]
const PACKAGE_ROOTS = ['packages/js', 'packages/python', 'packages/go', 'packages/rust']
const VERSION_STAMPS = [
  { file: 'packages/js/package.json', pattern: /("version":\s*")[^"]+(")/ },
  { file: 'packages/python/pyproject.toml', pattern: /(^version = ")[^"]+(")/m },
  { file: 'packages/rust/Cargo.toml', pattern: /(^version = ")[^"]+(")/m }
]

const version = fs.readFileSync(path.join(ROOT, 'packages', 'VERSION'), 'utf8').trim()
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`packages/VERSION is not a semver: ${version}`)
  process.exit(1)
}

const license = fs.readFileSync(path.join(ROOT, 'LICENSE.md'))
const schema = fs.readFileSync(path.join(ROOT, 'schema', 'vector.schema.json'))
const schemaSha256 = crypto.createHash('sha256').update(schema).digest('hex')

const groupFiles = fs.readdirSync(path.join(ROOT, 'vectors')).filter(f => f.endsWith('.json')).sort()
const groups = []
let total = 0
for (const f of groupFiles) {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'vectors', f), 'utf8'))
  groups.push({ group: path.basename(f, '.json'), file: f, count: doc.vectors.length })
  total += doc.vectors.length
}
const manifest = Buffer.from(JSON.stringify({ version, total, schemaSha256, groups }, null, 2) + '\n')

// desired state: dir -> { fileName -> Buffer }
const desired = new Map()
for (const dir of DATA_DIRS) {
  const files = { 'manifest.json': manifest }
  for (const f of groupFiles) files[f] = fs.readFileSync(path.join(ROOT, 'vectors', f))
  desired.set(dir, files)
}
for (const dir of PACKAGE_ROOTS) {
  desired.set(dir, { ...(desired.get(dir) || {}), 'LICENSE.md': license })
}
// The schema ships as a sibling of each data dir so the vectors' relative
// "$schema": "../schema/vector.schema.json" links resolve inside packages.
for (const dir of DATA_DIRS) {
  const schemaDir = path.posix.join(path.posix.dirname(dir), 'schema')
  desired.set(schemaDir, { 'vector.schema.json': schema })
}

let drift = 0
const report = (msg) => { drift++; console.error(`${CHECK ? 'DRIFT' : 'FIX'} ${msg}`) }

for (const [dir, files] of desired) {
  const abs = path.join(ROOT, dir)
  if (!CHECK) fs.mkdirSync(abs, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    const dest = path.join(abs, name)
    const same = fs.existsSync(dest) && fs.readFileSync(dest).equals(content)
    if (!same) {
      report(`${dir}/${name}`)
      if (!CHECK) fs.writeFileSync(dest, content)
    }
  }
  // stale vector files (data dirs only)
  if (DATA_DIRS.includes(dir) && fs.existsSync(abs)) {
    for (const existing of fs.readdirSync(abs).filter(f => f.endsWith('.json'))) {
      if (!files[existing]) {
        report(`${dir}/${existing} (stale)`)
        if (!CHECK) fs.unlinkSync(path.join(abs, existing))
      }
    }
  }
}

for (const { file, pattern } of VERSION_STAMPS) {
  const abs = path.join(ROOT, file)
  if (!fs.existsSync(abs)) {
    if (CHECK) report(`${file} (missing)`)
    continue // write mode: package not scaffolded yet; stamped on next sync
  }
  const src = fs.readFileSync(abs, 'utf8')
  if (!pattern.test(src)) {
    console.error(`cannot find version field in ${file}`)
    process.exit(1)
  }
  const out = src.replace(pattern, `$1${version}$2`)
  if (out !== src) {
    report(`${file} (version -> ${version})`)
    if (!CHECK) fs.writeFileSync(abs, out)
  }
}

if (CHECK && drift > 0) {
  console.error(`\n${drift} file(s) out of sync — run: node scripts/sync-packages.js`)
  process.exit(1)
}
console.log(CHECK
  ? `sync check OK: version ${version}, ${total} vectors, ${groupFiles.length} groups`
  : `synced version ${version}: ${total} vectors, ${groupFiles.length} groups -> ${DATA_DIRS.length} packages (${drift} file(s) updated)`)
