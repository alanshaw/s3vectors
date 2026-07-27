# Conversion report

Generated 2026-07-25 from the batch outputs in `.conversion/`.
Every vector was produced by a converter agent and checked by an independent adversarial
verifier against the original test source; per-exclusion detail is in
`.conversion/{ceph,msst}/merged-excluded.json`.

## Corpus

**1191 vectors** in 23 files.

| Tier | Vectors |
|---|---|
| tier-1 | 628 |
| tier-2 | 48 |
| tier-3 | 515 |

| Provenance | Vectors |
|---|---|
| source:msst-s3 | 679 |
| source:ceph-s3-tests | 514 |
| source:aws-sigv4-suite | 31 |
| source:storage-test | 5 |

| Area file | Vectors |
|---|---|
| vectors/acl.json | 81 |
| vectors/anon-access.json | 12 |
| vectors/bucket.json | 49 |
| vectors/bucket-logging.json | 11 |
| vectors/checksums.json | 44 |
| vectors/conditional.json | 57 |
| vectors/copy.json | 48 |
| vectors/cors.json | 21 |
| vectors/encoding.json | 22 |
| vectors/errors.json | 8 |
| vectors/lifecycle-config.json | 29 |
| vectors/listing.json | 111 |
| vectors/misc.json | 11 |
| vectors/multipart.json | 167 |
| vectors/object-crud.json | 159 |
| vectors/object-lock.json | 68 |
| vectors/policy.json | 53 |
| vectors/presigned.json | 7 |
| vectors/signing.json | 31 |
| vectors/sse.json | 44 |
| vectors/tagging.json | 44 |
| vectors/versioning.json | 93 |
| vectors/wire-headers.json | 21 |

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

## Deduplication

- **Exact duplicates**: 7 removed (structural hash after canonicalizing handles,
  dataset names and prng seeds) — log: `.conversion/dedup-exact.json`.
- **Semantic near-duplicates**: 188 candidate groups (vectors sharing prerequisite
  shape + operation sequence) reviewed per area by independent agents; **138 removed**
  (same behavior, assertions a subset of a kept vector; keeper absorbed the removed
  vector's provenance tags) — log: `.conversion/dedup-semantic.json`.
- **Contradictions (kept, needs adjudication)** — pairs asserting incompatible outcomes
  for the same request; both sides retained so runners/reviewers can decide which
  matches their target:
  1. acl-0042 vs acl-0058 — GetBucketOwnershipControls on a fresh bucket: 404
     OwnershipControlsNotFoundError (ceph, tagged quirk:not-aws) vs 200 with default
     BucketOwnerEnforced (AWS behavior).
  2. bucket-0022 vs bucket-0039 — owner re-creates their own bucket: BucketAlreadyExists
     vs BucketAlreadyOwnedByYou (both 409; AWS returns BucketAlreadyOwnedByYou outside
     us-east-1).
  3. multipart-0010 vs multipart-0107/0108 — UploadPartCopy with past-the-end
     CopySourceRange: InvalidRange vs InvalidArgument.
  4. sse-0028 vs sse-0045 — SSE-C read with a wrong (but valid) customer key: 400 vs
     403 AccessDenied.

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

- Schema + lint: `node scripts/validate.js` — 1191 vectors pass.
- Dataset digests: `node scripts/validate.js --digests` — all derived values computable.
- Every batch passed an adversarial verify agent comparing vectors against the Python
  source (verify totals across runs: ~1,300 vectors accepted, ~70 fixed in place,
  3 rejected to exclusions).
