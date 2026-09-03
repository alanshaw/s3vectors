//! Language-independent S3 API compatibility test vectors, embedded and parsed,
//! importable per feature area or all at once, plus the deterministic
//! test-data generator (feature `datagen`, on by default).
//!
//! Normative semantics (placeholder grammar, matcher semantics, generated data,
//! runner outcomes) are defined in the repository README:
//! <https://github.com/cloud-portable/s3vectors>
//!
//! The `signing` area embeds the published dummy credentials from the AWS SigV4
//! test suite — public documentation constants, never real secrets.

mod model;

pub use model::*;

#[cfg(feature = "datagen")]
pub mod datagen;

use std::sync::OnceLock;

macro_rules! corpus {
    ( $( $area:literal => $file:literal ),+ $(,)? ) => {
        static SOURCES: &[(&str, &str)] = &[ $( ($area, include_str!(concat!("../vectors/", $file))) ),+ ];
    };
}

corpus! {
    "acl" => "acl.json",
    "anon-access" => "anon-access.json",
    "bucket-logging" => "bucket-logging.json",
    "bucket" => "bucket.json",
    "checksums" => "checksums.json",
    "conditional" => "conditional.json",
    "copy" => "copy.json",
    "cors" => "cors.json",
    "encoding" => "encoding.json",
    "errors" => "errors.json",
    "lifecycle-config" => "lifecycle-config.json",
    "listing" => "listing.json",
    "misc" => "misc.json",
    "multipart" => "multipart.json",
    "object-crud" => "object-crud.json",
    "object-lock" => "object-lock.json",
    "policy" => "policy.json",
    "presigned" => "presigned.json",
    "signing" => "signing.json",
    "sse" => "sse.json",
    "tagging" => "tagging.json",
    "versioning" => "versioning.json",
    "wire-headers" => "wire-headers.json",
}

const AREA_COUNT: usize = 23;

static MANIFEST_JSON: &str = include_str!("../vectors/manifest.json");

#[allow(clippy::declare_interior_mutable_const)]
const CELL: OnceLock<VectorFile> = OnceLock::new();
static CACHE: [OnceLock<VectorFile>; AREA_COUNT] = [CELL; AREA_COUNT];
static MANIFEST: OnceLock<Manifest> = OnceLock::new();

/// The embedded corpus snapshot description (version, totals, areas).
pub fn manifest() -> &'static Manifest {
    MANIFEST.get_or_init(|| {
        serde_json::from_str(MANIFEST_JSON).expect("embedded manifest is valid")
    })
}

/// Area names, in embedded order.
pub fn areas() -> impl Iterator<Item = &'static str> {
    SOURCES.iter().map(|(name, _)| *name)
}

/// One area's vectors. Lazy; parsed once and cached.
/// Returns `None` for an unknown area name.
pub fn area(name: &str) -> Option<&'static VectorFile> {
    let idx = SOURCES.iter().position(|(n, _)| *n == name)?;
    Some(CACHE[idx].get_or_init(|| {
        serde_json::from_str(SOURCES[idx].1)
            .unwrap_or_else(|e| panic!("embedded area {name} is valid: {e}"))
    }))
}

/// Every area's vectors, in embedded order.
pub fn all() -> impl Iterator<Item = &'static VectorFile> {
    areas().map(|name| area(name).expect("known area"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn sources_match_area_count() {
        assert_eq!(super::SOURCES.len(), super::AREA_COUNT);
    }
}
