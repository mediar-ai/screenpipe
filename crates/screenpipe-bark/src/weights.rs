// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Exact reconstruction of bark-levels-v2/v3, based on Conway Research's
//! CC BY 4.0 bark_loader.py. NVIDIA / Moondream / Conway attribution is in NOTICE.

use anyhow::{bail, ensure, Context, Result};
use constriction::stream::{
    model::DefaultContiguousCategoricalEntropyModel, stack::DefaultAnsCoder, Decode,
};
use half::f16;
use serde::Deserialize;
use std::io::{Read, Write};

const MAX_ELEMENTS: usize = 64 * 1024 * 1024;
const MAX_HEADER: usize = 4 * 1024 * 1024;

#[derive(Deserialize)]
struct Header {
    format: String,
    index: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    n: String,
    k: String,
    shape: Vec<usize>,
    #[serde(default)]
    dtype: String,
    #[serde(default, rename = "K")]
    levels: usize,
    #[serde(default)]
    lev: usize,
    #[serde(default)]
    meta: usize,
    #[serde(default)]
    s: usize,
    b: usize,
    #[serde(default)]
    zl: bool,
    #[serde(default)]
    zs: bool,
    #[serde(default)]
    zr: bool,
}

pub struct Tensor {
    pub name: String,
    pub shape: Vec<usize>,
    pub values: Vec<f32>,
}

/// Decode one tensor at a time so loading never retains a second full f32 model.
pub fn read(mut input: impl Read, mut visit: impl FnMut(Tensor) -> Result<()>) -> Result<()> {
    let mut size = [0u8; 8];
    input
        .read_exact(&mut size)
        .context("truncated Bark header")?;
    let size = usize::try_from(u64::from_le_bytes(size))?;
    ensure!(size <= MAX_HEADER, "Bark header too large");
    let mut json = vec![0; size];
    input.read_exact(&mut json)?;
    let header: Header = serde_json::from_slice(&json)?;
    ensure!(
        matches!(header.format.as_str(), "bark-levels-v2" | "bark-levels-v3"),
        "unsupported Bark format"
    );
    ensure!(header.index.len() <= 4096, "too many tensors");
    for e in header.index {
        let elements = e
            .shape
            .iter()
            .try_fold(1usize, |n, &dim| n.checked_mul(dim))
            .context("tensor shape overflow")?;
        ensure!(
            elements > 0 && elements <= MAX_ELEMENTS,
            "invalid tensor size: {}",
            e.n
        );
        let values = match e.k.as_str() {
            "raw" => {
                let bytes_per_value = match e.dtype.as_str() {
                    // The format stores floating raw tensors as fp16 even when
                    // metadata retains the original torch.float32 dtype.
                    "torch.float16" | "torch.float32" => 2,
                    "torch.int64" => 8,
                    "torch.int32" => 4,
                    _ => bail!("unsupported raw dtype: {}", e.dtype),
                };
                let bytes = blob(&mut input, e.b, e.zr, elements * bytes_per_value)?;
                if e.n.ends_with("num_batches_tracked") {
                    continue;
                }
                ensure!(bytes_per_value == 2, "unexpected integer tensor: {}", e.n);
                fp16(&bytes)
            }
            "levels2" => {
                let (&rows, tail) = e
                    .shape
                    .split_first()
                    .context("levels tensor must be a matrix")?;
                let cols = tail.iter().product::<usize>();
                ensure!(
                    rows > 0 && cols > 0 && (1..=127).contains(&e.levels),
                    "invalid levels shape"
                );
                let levels = fp16(&blob(&mut input, e.lev, e.zl, rows * e.levels * 2)?);
                let classes_bytes = cols.div_ceil(2);
                let symbols = 2 * e.levels + 1;
                let metadata = blob(&mut input, e.meta, false, classes_bytes + 16 * symbols * 4)?;
                let counts = u32s(&metadata[classes_bytes..])?;
                let words = words(&mut input, e.b)?;
                let mut decoder = DefaultAnsCoder::from_compressed(words)
                    .map_err(|_| anyhow::anyhow!("invalid ANS state"))?;
                let mut out = vec![0f32; elements];
                for class in 0..16 {
                    let columns: Vec<usize> = (0..cols)
                        .filter(|&col| {
                            let shift = if col % 2 == 0 { 4 } else { 0 };
                            ((metadata[col / 2] >> shift) & 15) as usize == class
                        })
                        .collect();
                    if columns.is_empty() {
                        continue;
                    }
                    let model = categorical(&counts[class * symbols..(class + 1) * symbols])?;
                    // Python writes a (columns, rows) array then transposes it.
                    for col in columns {
                        for row in 0..rows {
                            let code = decoder
                                .decode_symbol(&model)
                                .map_err(|_| anyhow::anyhow!("corrupt ANS levels"))?;
                            out[row * cols + col] = if code == 0 {
                                0.0
                            } else {
                                let magnitude = if code <= e.levels {
                                    code
                                } else {
                                    code - e.levels
                                };
                                let value = levels[row * e.levels + magnitude - 1];
                                if code > e.levels {
                                    -value
                                } else {
                                    value
                                }
                            };
                        }
                    }
                }
                ensure!(decoder.is_empty(), "unused ANS levels data");
                out
            }
            kind if kind.starts_with("ansint") => {
                let bits: usize = kind[6..].parse()?;
                ensure!((2..=8).contains(&bits), "invalid integer quantization");
                let rows = *e.shape.first().context("missing row dimension")?;
                ensure!(rows > 0, "empty matrix");
                let scales = fp16(&blob(&mut input, e.s, e.zs, rows * 2)?);
                let counts = u32s(&blob(
                    &mut input,
                    e.meta,
                    false,
                    ((1usize << bits) - 1) * 4,
                )?)?;
                let model = categorical(&counts)?;
                let mut decoder = DefaultAnsCoder::from_compressed(words(&mut input, e.b)?)
                    .map_err(|_| anyhow::anyhow!("invalid ANS state"))?;
                let cols = elements / rows;
                let offset = (1usize << (bits - 1)) - 1;
                let mut out = Vec::with_capacity(elements);
                for i in 0..elements {
                    let symbol = decoder
                        .decode_symbol(&model)
                        .map_err(|_| anyhow::anyhow!("corrupt ANS integers"))?;
                    out.push((symbol as f32 - offset as f32) * scales[i / cols]);
                }
                ensure!(decoder.is_empty(), "unused ANS integer data");
                out
            }
            other => bail!("unsupported Bark tensor encoding: {other}"),
        };
        visit(Tensor {
            name: e.n,
            shape: e.shape,
            values,
        })
        .context("loading Bark tensor")?;
    }
    let mut trailing = [0];
    ensure!(input.read(&mut trailing)? == 0, "trailing Bark data");
    Ok(())
}

fn categorical(counts: &[u32]) -> Result<DefaultContiguousCategoricalEntropyModel> {
    let sum: f64 = counts.iter().map(|&n| n as f64).sum();
    ensure!(sum > 0.0, "empty ANS probability model");
    // Match Categorical(counts / counts.sum(), perfect=False), including f64 normalization.
    let probabilities: Vec<f64> = counts.iter().map(|&n| n as f64 / sum).collect();
    DefaultContiguousCategoricalEntropyModel::from_floating_point_probabilities_fast(
        &probabilities,
        None,
    )
    .map_err(|_| anyhow::anyhow!("invalid categorical probabilities"))
}

fn u32s(bytes: &[u8]) -> Result<Vec<u32>> {
    ensure!(bytes.len().is_multiple_of(4), "unaligned ANS words");
    Ok(bytes
        .chunks_exact(4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .collect())
}

fn words(input: &mut impl Read, size: usize) -> Result<Vec<u32>> {
    ensure!(size <= MAX_ELEMENTS * 4, "ANS blob too large");
    u32s(&blob(input, size, false, size)?)
}

fn fp16(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(2)
        .map(|b| f16::from_bits(u16::from_le_bytes([b[0], b[1]])).to_f32())
        .collect()
}

struct BoundedOutput {
    bytes: Vec<u8>,
    limit: usize,
}
impl Write for BoundedOutput {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if self.bytes.len() + bytes.len() > self.limit {
            return Err(std::io::Error::other("oversized decompressed tensor"));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn blob(input: &mut impl Read, size: usize, compressed: bool, expected: usize) -> Result<Vec<u8>> {
    ensure!(
        size <= MAX_ELEMENTS * 8 && expected <= MAX_ELEMENTS * 8,
        "oversized tensor blob"
    );
    let mut bytes = vec![0; size];
    input.read_exact(&mut bytes)?;
    if compressed {
        let mut output = BoundedOutput {
            bytes: Vec::new(),
            limit: expected,
        };
        lzma_rs::xz_decompress(&mut bytes.as_slice(), &mut output)
            .context("invalid Bark XZ blob")?;
        bytes = output.bytes;
    }
    ensure!(
        bytes.len() == expected,
        "tensor byte count mismatch: {} != {}",
        bytes.len(),
        expected
    );
    Ok(bytes)
}
