// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
use anyhow::{ensure, Context, Result};
use audiopipe::parakeet_mlx::{
    audio::{get_logmel, MelConfig},
    conformer::Conformer,
    rnnt::{JointNetwork, PredictNetwork},
};
use mlx_rs::Array;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::File,
    io::{BufReader, Read},
    path::Path,
    sync::Mutex,
};

/// Screenpipe also holds this around its Parakeet MLX calls and model loads,
/// preventing overlap with Bark during model switches/reconciliation.
pub static MLX_LOCK: Mutex<()> = Mutex::new(());

pub struct BarkModel {
    encoder: Conformer,
    predict: PredictNetwork,
    joint: JointNetwork,
    vocab: Vec<String>,
}

// Like audiopipe's Parakeet model, MLX handles can move between worker threads.
// Callers serialize access via &mut self and MLX_LOCK, including model loading.
unsafe impl Send for BarkModel {}

impl BarkModel {
    pub fn load(path: &Path) -> Result<Self> {
        let _guard = MLX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let _sync = SynchronizeOnDrop;
        let mut file = File::open(path)?;
        let mut hash = Sha256::new();
        let mut buffer = [0; 65536];
        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hash.update(&buffer[..n]);
        }
        ensure!(
            format!("{:x}", hash.finalize()) == crate::MODEL_SHA256,
            "Bark model SHA-256 mismatch"
        );
        let config: serde_json::Value = serde_json::from_reader(File::open(
            path.parent()
                .context("model directory")?
                .join("mlx/config.json"),
        )?)?;
        let vocab: Vec<String> = serde_json::from_value(config["joint"]["vocabulary"].clone())?;
        ensure!(vocab.len() == 8192, "unexpected Bark vocabulary");
        let mut weights = HashMap::new();
        let mut biases: HashMap<String, Vec<f32>> = HashMap::new();
        crate::weights::read(BufReader::new(File::open(path)?), |tensor| {
            if tensor.name.starts_with("vad_head") {
                return Ok(());
            }
            let (name, shape, values) = convert(tensor)?;
            if name.ends_with(".lstm.0.bias") || name.ends_with(".lstm.1.bias") {
                if let Some(first) = biases.remove(&name) {
                    ensure!(first.len() == values.len(), "LSTM bias length mismatch");
                    let values: Vec<f32> = first.iter().zip(values).map(|(a, b)| a + b).collect();
                    weights.insert(name, Array::from_slice(&values, &shape));
                } else {
                    biases.insert(name, values);
                }
            } else {
                weights.insert(name, Array::from_slice(&values, &shape));
            }
            Ok(())
        })?;
        ensure!(biases.is_empty(), "unpaired LSTM bias");
        // Independently fingerprinted from the official bark_mlx.py conversion.
        // Validate all 697 names/shapes before an encoder loader can silently
        // retain randomly initialized parameters after a mapping regression.
        let layout: std::collections::BTreeMap<_, _> = weights
            .iter()
            .map(|(name, array)| (name, array.shape().to_vec()))
            .collect();
        let layout_hash = Sha256::digest(serde_json::to_vec(&layout)?);
        ensure!(
            format!("{layout_hash:x}")
                == "360c33ba5df2fc6d35c3e2d33ccea1276440ca1257b981dde500d10ed06b1b5e",
            "Bark MLX tensor layout mismatch"
        );
        let mut encoder = Conformer::new(128, 24, 1024, 8, 4, 8, 9, 256, 5000, false, false)?;
        let mut predict = PredictNetwork::new(8193, 640, 640, 2)?;
        let mut joint = JointNetwork::new(1024, 640, 640, 8198)?;
        predict.load_weights(&weights)?;
        joint.load_weights(&weights)?;
        encoder.load_weights(&weights, "encoder");
        mlx_rs::transforms::eval(weights.values())?;
        synchronize();
        Ok(Self {
            encoder,
            predict,
            joint,
            vocab,
        })
    }

    /// Input is mono 16 kHz, as supplied by Screenpipe's transcription pipeline.
    /// Split at 30 seconds and use the upstream evaluated 250 ms leading silence.
    pub fn transcribe(&mut self, audio: &[f32]) -> Result<String> {
        ensure!(audio.iter().all(|s| s.is_finite()), "non-finite audio");
        if audio.is_empty() || audio.iter().all(|s| *s == 0.0) {
            return Ok(String::new());
        }
        let _guard = MLX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let _sync = SynchronizeOnDrop;
        let mut texts = Vec::new();
        for chunk in audio.chunks(30 * 16000) {
            let mut padded = vec![0f32; 4000];
            padded.extend_from_slice(chunk);
            // Fixed shape, like Screenpipe's Parakeet MLX path, bounds graph/cache
            // growth when recording batches have subtly different durations.
            padded.resize(30 * 16000 + 4000, 0.0);
            let array = Array::from_slice(&padded, &[padded.len() as i32]);
            let mel = get_logmel(&array, &MelConfig::default())?;
            let (encoded, _) = self.encoder.forward(&mel, None)?;
            mlx_rs::transforms::eval([&encoded])?;
            let text = decode(&encoded, &mut self.predict, &mut self.joint, &self.vocab)?;
            if !text.trim().is_empty() {
                texts.push(text.trim().to_owned());
            }
        }
        Ok(texts.join(" "))
    }
}

struct SynchronizeOnDrop;
impl Drop for SynchronizeOnDrop {
    fn drop(&mut self) {
        synchronize();
    }
}
fn synchronize() {
    // Drain Metal before releasing MLX_LOCK, including on an inference error.
    unsafe {
        let stream = if matches!(
            mlx_rs::Device::default().get_type(),
            Ok(mlx_rs::DeviceType::Cpu)
        ) {
            mlx_default_cpu_stream_new()
        } else {
            mlx_default_gpu_stream_new()
        };
        mlx_synchronize(stream);
        mlx_stream_free(stream);
    }
}
extern "C" {
    fn mlx_default_gpu_stream_new() -> *mut std::ffi::c_void;
    fn mlx_default_cpu_stream_new() -> *mut std::ffi::c_void;
    fn mlx_synchronize(stream: *mut std::ffi::c_void) -> i32;
    fn mlx_stream_free(stream: *mut std::ffi::c_void) -> i32;
}

/// Greedy token-and-duration decoding, with the same recurrence and ten-symbol
/// sticking guard as audiopipe's decoder. Its public function exposes a private
/// ContextBiaser type, so use the public prediction/joint networks directly.
fn decode(
    encoded: &Array,
    predict: &mut PredictNetwork,
    joint: &mut JointNetwork,
    vocab: &[String],
) -> Result<String> {
    use mlx_rs::ops::indexing::{argmax_axis, IndexOp};
    let mut h = None::<Vec<Array>>;
    let mut c = None::<Vec<Array>>;
    let mut last_token = None::<Array>;
    let (mut frame, mut emitted) = (0, 0);
    let mut text = String::new();
    while frame < encoded.shape()[1] as usize {
        let (prediction, next_h, next_c) = if let Some(token) = &last_token {
            predict.predict_step(token, h.as_deref(), c.as_deref())?
        } else {
            predict.forward(None, h.as_deref(), c.as_deref())?
        };
        let encoder_frame = encoded.index((0, frame as i32, ..)).reshape(&[1, -1])?;
        let prediction = prediction.index((0, 0, ..)).reshape(&[1, -1])?;
        let logits = joint.forward_step(&encoder_frame, &prediction)?.index(0);
        let tokens = logits.index(..8193).reshape(&[1, -1])?;
        let durations = logits.index(8193..).reshape(&[1, -1])?;
        let token = argmax_axis(&tokens, -1, false)?.as_slice::<u32>()[0] as usize;
        let duration = argmax_axis(&durations, -1, false)?.as_slice::<u32>()[0] as usize;
        ensure!(token <= 8192 && duration <= 4, "invalid TDT prediction");
        if token != 8192 {
            let piece = &vocab[token];
            append_piece(&mut text, piece);
            last_token = Some(mlx_rs::array!([token as i32]));
            h = Some(next_h);
            c = Some(next_c);
            emitted += 1;
        }
        if token == 8192 || emitted >= 10 {
            frame += duration.max(1);
            emitted = 0;
        } else if duration != 0 {
            frame += duration;
            emitted = 0;
        }
    }
    Ok(text)
}

fn append_piece(text: &mut String, piece: &str) {
    // Match the official processor's skip_special_tokens=True behavior.
    if piece == "<unk>" {
        return;
    }
    if let Some(word) = piece.strip_prefix('\u{2581}') {
        if !text.is_empty() {
            text.push(' ');
        }
        text.push_str(word);
    } else {
        text.push_str(piece);
    }
}

fn convert(t: crate::weights::Tensor) -> Result<(String, Vec<i32>, Vec<f32>)> {
    let mut name = t.name;
    let mut shape: Vec<i32> = t
        .shape
        .iter()
        .map(|&x| i32::try_from(x))
        .collect::<std::result::Result<_, _>>()?;
    let mut values = t.values;
    if let Some(lstm) = name.strip_prefix("decoder.lstm.") {
        let (kind, layer) = lstm.rsplit_once("_l").context("invalid LSTM key")?;
        let suffix = match kind {
            "weight_ih" => "Wx",
            "weight_hh" => "Wh",
            "bias_ih" | "bias_hh" => "bias",
            _ => anyhow::bail!("unknown LSTM tensor"),
        };
        name = format!("decoder.prediction.dec_rnn.lstm.{layer}.{suffix}");
    } else {
        if name.starts_with("encoder.subsampling.layers.") && name.ends_with(".weight") {
            ensure!(shape.len() == 4, "invalid subsampling weight");
            // PyTorch OIHW -> MLX OHWI.
            let [o, i, h, w] = <[usize; 4]>::try_from(t.shape.as_slice())?;
            let mut out = vec![0.; values.len()];
            for a in 0..o {
                for b in 0..i {
                    for c in 0..h {
                        for d in 0..w {
                            out[((a * h + c) * w + d) * i + b] =
                                values[((a * i + b) * h + c) * w + d];
                        }
                    }
                }
            }
            values = out;
            shape = vec![o as i32, h as i32, w as i32, i as i32];
        } else if name.ends_with(".weight")
            && [
                ".conv.depthwise_conv.",
                ".conv.pointwise_conv1.",
                ".conv.pointwise_conv2.",
            ]
            .iter()
            .any(|part| name.contains(part))
        {
            ensure!(shape.len() == 3, "invalid convolution weight");
            let [o, i, k] = <[usize; 3]>::try_from(t.shape.as_slice())?;
            let mut out = vec![0.; values.len()];
            for a in 0..o {
                for b in 0..i {
                    for c in 0..k {
                        out[(a * k + c) * i + b] = values[(a * i + b) * k + c];
                    }
                }
            }
            values = out;
            shape = vec![o as i32, k as i32, i as i32];
        }
        for (old, new) in [
            ("encoder.subsampling.layers.", "encoder.pre_encode.conv."),
            ("encoder.subsampling.linear.", "encoder.pre_encode.out."),
            (".conv.norm.", ".conv.batch_norm."),
            (".q_proj.", ".linear_q."),
            (".k_proj.", ".linear_k."),
            (".v_proj.", ".linear_v."),
            (".o_proj.", ".linear_out."),
            (".relative_k_proj.", ".linear_pos."),
            (".bias_u", ".pos_bias_u"),
            (".bias_v", ".pos_bias_v"),
            ("decoder.embedding.", "decoder.prediction.embed."),
            ("encoder_projector.", "joint.enc."),
            ("decoder.decoder_projector.", "joint.pred."),
            ("joint.head.", "joint.joint_net.2."),
        ] {
            name = name.replace(old, new);
        }
    }
    Ok((name, shape, values))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sentencepiece_words_and_special_tokens_match_official_text_decode() {
        let mut text = String::new();
        for piece in ["<unk>", "▁Hello", ",", "▁world", "<unk>", "."] {
            append_piece(&mut text, piece);
        }
        assert_eq!(text, "Hello, world.");
    }
    #[test]
    fn convolution_layout_is_channels_last() {
        let t = crate::weights::Tensor {
            name: "encoder.subsampling.layers.0.weight".into(),
            shape: vec![1, 2, 1, 2],
            values: vec![1., 2., 3., 4.],
        };
        let (name, shape, values) = convert(t).unwrap();
        assert_eq!(name, "encoder.pre_encode.conv.0.weight");
        assert_eq!(shape, [1, 1, 2, 2]);
        assert_eq!(values, [1., 3., 2., 4.]);
    }
}
