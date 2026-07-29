# Releasing the language packages

All four packages (npm, PyPI, crates.io, Go module) release in **lockstep**: one
version number identifies the corpus snapshot. `packages/VERSION` is the only
place the version is authored; everything else is stamped by the sync script.

Version bumps: adding vectors = minor; fixing a vector's expectation = patch or
minor by judgment; schema/model breaking change = major (note: a 2.0 requires
the Go module path to become `.../packages/go/v2`).

## Checklist for version X.Y.Z

1. Edit `packages/VERSION`.
2. `node scripts/sync-packages.js` (copies vectors + manifest, stamps versions).
3. Verify everything:

   ```sh
   node scripts/validate.js
   node scripts/datagen.js --self-test
   node scripts/sync-packages.js --check
   (cd packages/js && npm test)
   (cd packages/python && python3 -m unittest discover -s tests)
   (cd packages/go && go test ./...)
   (cd packages/rust && cargo test && cargo test --no-default-features)
   ```

4. Commit, then tag **twice** — the Go module requires a path-prefixed tag:

   ```sh
   git tag vX.Y.Z
   git tag packages/go/vX.Y.Z
   git push origin main vX.Y.Z packages/go/vX.Y.Z
   ```

5. Publish (crates.io last — it is immutable):

   ```sh
   (cd packages/js && npm publish --access public)
   (cd packages/python && python3 -m build && twine upload dist/*)   # or: uv build && uv publish
   (cd packages/rust && cargo package --list | grep -q vectors/manifest.json && cargo publish)
   ```

   The Go module needs no publish step — pushing the `packages/go/vX.Y.Z` tag is
   the release. Optionally warm the proxy:

   ```sh
   GOPROXY=proxy.golang.org go list -m github.com/cloud-portable/s3vectors/packages/go@vX.Y.Z
   ```

## Notes

- `npm pack --dry-run` / `cargo package --list` show exactly what ships; the
  vector data directories must be included.
- crates.io and pkg.go.dev license detectors may not recognize the
  Permissive-License-Stack prose in `LICENSE.md`; the SPDX expression
  `Apache-2.0 OR MIT` is declared in every manifest. If pkg.go.dev refuses to
  render docs, add standard-text `LICENSE-APACHE` / `LICENSE-MIT` files.
