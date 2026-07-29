//! Tests that must pass with `--no-default-features` (vectors, no datagen).

use cloud_portable_s3vectors as s3v;

#[test]
fn corpus_loads_without_datagen() {
    let m = s3v::manifest();
    let mut total = 0;
    for entry in &m.areas {
        total += s3v::area(&entry.area).expect("area loads").vectors.len();
    }
    assert_eq!(total, m.total);
}
