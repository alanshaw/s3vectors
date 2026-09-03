//! Rust port of the vector generated-data reference: materialize a vector's
//! named datasets and compute the derived digest strings that
//! `${data.<name>.<field>}` placeholders resolve to.

use std::collections::BTreeMap;
use std::fmt;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use crc::Crc;
use md5::Md5;
use sha1::Sha1;
use sha2::{Digest as _, Sha256};

use crate::model::DataSpec;

/// The fields available as `${data.<name>.<field>}` placeholders.
pub const DERIVED_FIELDS: [DerivedField; 9] = [
    DerivedField::Size,
    DerivedField::Md5,
    DerivedField::Etag,
    DerivedField::Sha256,
    DerivedField::Sha256B64,
    DerivedField::Sha1B64,
    DerivedField::Crc32B64,
    DerivedField::Crc32cB64,
    DerivedField::Crc64NvmeB64,
];

/// A derived digest field.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DerivedField {
    Size,
    Md5,
    Etag,
    Sha256,
    Sha256B64,
    Sha1B64,
    Crc32B64,
    Crc32cB64,
    Crc64NvmeB64,
}

impl DerivedField {
    /// The field name as written in placeholders (`crc32cB64`, ...).
    pub fn as_str(&self) -> &'static str {
        match self {
            DerivedField::Size => "size",
            DerivedField::Md5 => "md5",
            DerivedField::Etag => "etag",
            DerivedField::Sha256 => "sha256",
            DerivedField::Sha256B64 => "sha256B64",
            DerivedField::Sha1B64 => "sha1B64",
            DerivedField::Crc32B64 => "crc32B64",
            DerivedField::Crc32cB64 => "crc32cB64",
            DerivedField::Crc64NvmeB64 => "crc64nvmeB64",
        }
    }
}

impl std::str::FromStr for DerivedField {
    type Err = Error;

    fn from_str(s: &str) -> Result<Self, Error> {
        DERIVED_FIELDS
            .into_iter()
            .find(|f| f.as_str() == s)
            .ok_or_else(|| Error::UnknownField(s.to_string()))
    }
}

/// Datagen error.
#[derive(Debug)]
pub enum Error {
    UnknownDataset(String),
    UnknownField(String),
    ChainedSlice { name: String, of: String },
    SliceOutOfRange { name: String, of: String },
    BadPattern(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::UnknownDataset(name) => write!(f, "unknown dataset: {name}"),
            Error::UnknownField(field) => write!(f, "unknown derived data field: {field}"),
            Error::ChainedSlice { name, of } => {
                write!(f, "slice {name:?} references slice {of:?} (chained slices are not allowed)")
            }
            Error::SliceOutOfRange { name, of } => {
                write!(f, "slice {name:?} exceeds bounds of {of:?}")
            }
            Error::BadPattern(name) => write!(f, "dataset {name:?} has an invalid pattern"),
        }
    }
}

impl std::error::Error for Error {}

// block(i) = SHA256(UTF8(seed) || BE64(i)); stream = block(0) || block(1) || ...
fn prng(seed: &str, size: u64) -> Vec<u8> {
    let size = size as usize;
    let mut out = vec![0u8; size];
    let mut i: u64 = 0;
    let mut off = 0usize;
    while off < size {
        let mut h = Sha256::new();
        h.update(seed.as_bytes());
        h.update(i.to_be_bytes());
        let block = h.finalize();
        let n = usize::min(32, size - off);
        out[off..off + n].copy_from_slice(&block[..n]);
        off += 32;
        i += 1;
    }
    out
}

fn pattern(name: &str, pattern_bytes: &[u8], size: u64) -> Result<Vec<u8>, Error> {
    if pattern_bytes.is_empty() {
        return Err(Error::BadPattern(name.to_string()));
    }
    let size = size as usize;
    let mut out = vec![0u8; size];
    let mut off = 0usize;
    while off < size {
        let n = usize::min(pattern_bytes.len(), size - off);
        out[off..off + n].copy_from_slice(&pattern_bytes[..n]);
        off += pattern_bytes.len();
    }
    Ok(out)
}

/// Materialize one named dataset from a vector's `data` map.
pub fn generate(specs: &BTreeMap<String, DataSpec>, name: &str) -> Result<Vec<u8>, Error> {
    let spec = specs
        .get(name)
        .ok_or_else(|| Error::UnknownDataset(name.to_string()))?;
    match spec {
        DataSpec::Prng(d) => Ok(prng(&d.seed, d.size)),
        DataSpec::Pattern(d) => match (&d.pattern, &d.pattern_base64) {
            (Some(p), _) => pattern(name, p.as_bytes(), d.size),
            (None, Some(b64)) => {
                let raw = BASE64
                    .decode(b64)
                    .map_err(|_| Error::BadPattern(name.to_string()))?;
                pattern(name, &raw, d.size)
            }
            (None, None) => Err(Error::BadPattern(name.to_string())),
        },
        DataSpec::Slice(d) => {
            let parent = specs
                .get(&d.of)
                .ok_or_else(|| Error::UnknownDataset(d.of.clone()))?;
            if matches!(parent, DataSpec::Slice(_)) {
                return Err(Error::ChainedSlice {
                    name: name.to_string(),
                    of: d.of.clone(),
                });
            }
            let base = generate(specs, &d.of)?;
            let end = d
                .offset
                .checked_add(d.length)
                .ok_or_else(|| Error::SliceOutOfRange {
                    name: name.to_string(),
                    of: d.of.clone(),
                })?;
            if end > base.len() as u64 {
                return Err(Error::SliceOutOfRange {
                    name: name.to_string(),
                    of: d.of.clone(),
                });
            }
            Ok(base[d.offset as usize..end as usize].to_vec())
        }
    }
}

const CRC32: Crc<u32> = Crc::<u32>::new(&crc::CRC_32_ISO_HDLC);
const CRC32C: Crc<u32> = Crc::<u32>::new(&crc::CRC_32_ISCSI);
const CRC64NVME: Crc<u64> = Crc::<u64>::new(&crc::CRC_64_NVME);

/// Compute the string a `${data.<name>.<field>}` placeholder resolves to.
pub fn derived(
    specs: &BTreeMap<String, DataSpec>,
    name: &str,
    field: DerivedField,
) -> Result<String, Error> {
    let bytes = generate(specs, name)?;
    Ok(match field {
        DerivedField::Size => bytes.len().to_string(),
        DerivedField::Md5 => hex(&Md5::digest(&bytes)),
        DerivedField::Etag => format!("\"{}\"", hex(&Md5::digest(&bytes))),
        DerivedField::Sha256 => hex(&Sha256::digest(&bytes)),
        DerivedField::Sha256B64 => BASE64.encode(Sha256::digest(&bytes)),
        DerivedField::Sha1B64 => BASE64.encode(Sha1::digest(&bytes)),
        DerivedField::Crc32B64 => BASE64.encode(CRC32.checksum(&bytes).to_be_bytes()),
        DerivedField::Crc32cB64 => BASE64.encode(CRC32C.checksum(&bytes).to_be_bytes()),
        DerivedField::Crc64NvmeB64 => BASE64.encode(CRC64NVME.checksum(&bytes).to_be_bytes()),
    })
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}
