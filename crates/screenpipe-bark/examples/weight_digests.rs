// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Compare these hashes against the official loader's f32 tensors, without
//! retaining another full decoded model or allocating any GPU resources.
use anyhow::Result;
use sha2::{Digest, Sha256};
fn main() -> Result<()> {
    let path = std::env::args().nth(1).expect("weight_digests MODEL.bark");
    let mut hashes = std::collections::BTreeMap::new();
    screenpipe_bark::weights::read(std::io::BufReader::new(std::fs::File::open(path)?), |t| {
        let mut hash = Sha256::new();
        for value in t.values {
            hash.update(value.to_le_bytes());
        }
        hashes.insert(t.name, format!("{:x}", hash.finalize()));
        Ok(())
    })?;
    println!("{}", serde_json::to_string_pretty(&hashes)?);
    Ok(())
}
