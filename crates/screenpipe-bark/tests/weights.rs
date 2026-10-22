// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
use screenpipe_bark::weights;

// Fixtures encoded using constriction Python 0.5.0, Categorical(...,
// perfect=False), NumPy fp16 and Python lzma (XZ), independently of this reader.
#[test]
fn official_levels_layout_sign_and_class_order() {
    let mut count = 0;
    weights::read(&include_bytes!("fixtures/levels-v3.bark")[..], |t| {
        assert_eq!(t.shape, [2, 4]);
        assert_eq!(t.values, [0., 1., -2., 2., 3., -4., 4., -3.]);
        count += 1;
        Ok(())
    })
    .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn official_symmetric_integers_and_row_scales() {
    weights::read(&include_bytes!("fixtures/integers-v3.bark")[..], |t| {
        assert_eq!(t.values, [-7.5, -7., 0., 28., 30., 2.]);
        Ok(())
    })
    .unwrap();
}

#[test]
fn truncated_header_and_tensor_fail_without_panic() {
    let fixture = include_bytes!("fixtures/levels-v3.bark");
    for size in [0, 7, 8, 100, fixture.len() - 1] {
        assert!(weights::read(&fixture[..size], |_| Ok(())).is_err());
    }
}

#[test]
fn oversized_header_is_rejected_before_allocation() {
    assert!(weights::read(&u64::MAX.to_le_bytes()[..], |_| Ok(())).is_err());
}

#[test]
#[ignore = "requires the pinned 163 MB Bark model; set BARK_MODEL_PATH"]
fn all_699_tensors_match_official_loader() {
    use sha2::{Digest, Sha256};
    let path = std::env::var("BARK_MODEL_PATH").expect("BARK_MODEL_PATH");
    let mut hashes = std::collections::BTreeMap::new();
    weights::read(
        std::io::BufReader::new(std::fs::File::open(path).unwrap()),
        |t| {
            let mut hash = Sha256::new();
            for v in t.values {
                hash.update(v.to_le_bytes());
            }
            hashes.insert(t.name, format!("{:x}", hash.finalize()));
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(hashes.len(), 699);
    let hash = Sha256::digest(serde_json::to_vec(&hashes).unwrap());
    // Independently computed from the official bark_loader.py load_state_dict,
    // NumPy float32 bytes, SHA-256 per tensor, sorted compact JSON map.
    assert_eq!(
        format!("{hash:x}"),
        "2d1b1e91affb11023ea8754acf47b2bed93613875ef0669fbf5a0f96398488cf"
    );
}
