# Conversion report

Generated 2026-07-24 from the batch outputs in `.conversion/`.
Every vector was produced by a converter agent and checked by an independent adversarial
verifier against the original test source; per-exclusion detail is in
`.conversion/{ceph,msst}/merged-excluded.json`.

## Corpus

**1336 vectors** in 23 files.

| Tier | Vectors |
|---|---|
| tier-1 | 729 |
| tier-2 | 54 |
| tier-3 | 553 |

| Provenance | Vectors |
|---|---|
| source:msst-s3 | 755 |
| source:ceph-s3-tests | 543 |
| source:aws-sigv4-suite | 31 |
| source:storage-test | 7 |

| Area file | Vectors |
|---|---|
| vectors/acl.json | 84 |
| vectors/anon-access.json | 12 |
| vectors/bucket.json | 55 |
| vectors/bucket-logging.json | 11 |
| vectors/checksums.json | 51 |
| vectors/conditional.json | 59 |
| vectors/copy.json | 65 |
| vectors/cors.json | 22 |
| vectors/encoding.json | 22 |
| vectors/errors.json | 8 |
| vectors/lifecycle-config.json | 29 |
| vectors/listing.json | 122 |
| vectors/misc.json | 11 |
| vectors/multipart.json | 192 |
| vectors/object-crud.json | 198 |
| vectors/object-lock.json | 78 |
| vectors/policy.json | 56 |
| vectors/presigned.json | 7 |
| vectors/signing.json | 31 |
| vectors/sse.json | 54 |
| vectors/tagging.json | 45 |
| vectors/versioning.json | 97 |
| vectors/wire-headers.json | 27 |

## Sources

### aws-sig-v4-test-suite
All 31 signing groups converted mechanically (script) to `vectors/signing.json`; every
vector's canonical request hash, HMAC signature chain and Authorization header were
independently recomputed and match.

### storage-test (olizilla)
All 7 cases converted to `vectors/object-crud.json`.

### ceph s3-tests (pinned 5522d1c)
808 test functions in test_s3.py + test_headers.py triaged in 39 batches:
**543 converted**, **283 excluded**. Whole modules excluded up front
(not counted above): test_iam.py (90), test_sts.py (37), test_s3select.py (38), test_sns.py (5), test_s3control.py (1) —
they need IAM/STS/SNS/S3 Select/account provisioning outside the v1 prerequisite model.

Exclusions by category:

| Category | Tests |
|---|---|
| not-expressible | 62 |
| server-config | 61 |
| concurrency | 45 |
| post-policy | 40 |
| rgw-extension | 35 |
| time-based | 26 |
| iam-sts | 8 |
| presign-negative | 4 |
| duplicate-of | 1 |
| sdk-behavior | 1 |

### msst-s3 (pinned b84a323)
2,290 test functions triaged: hand-written edge/ + production/ tests converted
faithfully in 31 batches; bulk-generated numeric tests triaged aggressively in 22
batches; 10 directories (access_points, analytics, batch, lambda, object_lambda,
notifications, replication, tiering, performance, stress — 1,005 tests) excluded
wholesale. **755 converted**, **1640 excluded**.

Exclusions by category:

| Category | Tests |
|---|---|
| server-config | 805 |
| no-assertions | 344 |
| duplicate-of | 218 |
| concurrency | 115 |
| performance | 103 |
| not-expressible | 38 |
| sdk-behavior | 9 |
| time-based | 7 |
| iam-sts | 1 |

## Conventions applied during conversion

- Vectors carry a `source` permalink to the originating test (github, pinned commit).
- `fails_on_aws` pytest markers became the `quirk:not-aws` tag; RGW-implementation
  markers (fails_on_dbstore/rgw/dho) were dropped.
- Where a source test accepted multiple error codes (e.g. InvalidArgument|MalformedXML),
  the vector asserts only the shared HTTP status, with accepted codes noted in its
  description.
- Relative timestamps (now±1h) became fixed far-past/far-future literals.
- Tests accepting either-of-two outcomes (success OR error) were excluded as
  `not-expressible` — the expect model is deliberately deterministic.

## Verification

- Schema + lint: `node scripts/validate.js` — 1336 vectors pass.
- Dataset digests: `node scripts/validate.js --digests` — all derived values computable.
- Every batch passed an adversarial verify agent comparing vectors against the Python
  source (verify totals across runs: ~1,300 vectors accepted, ~70 fixed in place,
  3 rejected to exclusions).
