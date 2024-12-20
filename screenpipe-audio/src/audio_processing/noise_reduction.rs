use anyhow::Result;
use df::tract::{DfParams, DfTract, RuntimeParams};
use df::transforms::resample;
use dirs;
use lazy_static::lazy_static;
use log::{debug, info};
use std::path::PathBuf;
use std::sync::Once;
use tokio::sync::Mutex;
use tract_core::ndarray::{Array2, ArrayD, Axis};

lazy_static! {
    static ref V3_MODEL_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
    static ref V3LL_MODEL_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
}

static DOWNLOAD_V3_ONCE: Once = Once::new();
static DOWNLOAD_V3LL_ONCE: Once = Once::new();

#[derive(Clone, Copy)]
pub enum NoiseReductionModel {
    V3,
    V3LL,
}

impl std::fmt::Display for NoiseReductionModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NoiseReductionModel::V3 => write!(f, "DeepFilterNet3_onnx.tar.gz"),
            NoiseReductionModel::V3LL => write!(f, "DeepFilterNet3_ll_onnx.tar.gz"),
        }
    }
}

impl NoiseReductionModel {
    pub fn filename(&self) -> &'static str {
        match self {
            NoiseReductionModel::V3 => "DeepFilterNet3_onnx.tar.gz",
            NoiseReductionModel::V3LL => "DeepFilterNet3_ll_onnx.tar.gz",
        }
    }
}

/// NoiseFilter is used to process the audio stream and reduce the noise.
/// Audio processed by this filter will be resampled to 16KHz.
pub struct NoiseFilter {
    delay: usize,
    model: DfTract,
    stream_sample_rate: usize,
    model_sample_rate: usize,
}

unsafe impl Send for NoiseFilter {}
unsafe impl Sync for NoiseFilter {}

impl NoiseFilter {
    /// Initialize the noise filter with the given model and sample rate.
    ///
    /// This function will download the model if it is not already present in the cache directory.
    ///
    /// # Arguments
    /// * `model_path` - The path to the noise reduction model
    ///
    /// # Returns
    /// The initialized noise filter
    pub async fn new(model_path: PathBuf, sample_rate: u32) -> Result<Self> {
        let mut r_params = RuntimeParams::default();
        r_params = r_params
            .with_atten_lim(100.0)
            .with_thresholds(-15.0, 35.0, 35.0);
        // if args.post_filter {
        r_params = r_params.with_post_filter(0.02);
        // }
        if let Ok(red) = 1.try_into() {
            r_params = r_params.with_mask_reduce(red);
        } else {
            log::warn!("Input not valid for `reduce_mask`.")
        }
        let df_params = match DfParams::new(model_path.clone()) {
            Ok(p) => p,
            Err(e) => {
                log::error!("Error opening model {}: {}", model_path.display(), e);
                return Err(e);
            }
        };

        let mut model: DfTract = DfTract::new(df_params.clone(), &r_params)?;
        model.ch = 1;
        let sr = model.sr;
        let mut delay = model.fft_size - model.hop_size; // STFT delay
        delay += model.lookahead * model.hop_size; // Add model latency due to lookahead
        Ok(Self {
            model,
            delay,
            stream_sample_rate: sample_rate as usize,
            model_sample_rate: sr,
        })
    }

    pub fn process(&mut self, input: &[f32]) -> Result<Vec<f32>> {
        // if self.model.n_ch != reader.channels {
        //     self.model.n_ch = reader.channels;
        //     model = DfTract::new(df_params.clone(), &r_params)?;
        //     sr = model.sr;
        // }

        let mut noisy = Array2::from_shape_vec((1, input.len()), input.to_vec())?;

        if self.model_sample_rate != self.stream_sample_rate {
            noisy = resample(
                noisy.view(),
                self.stream_sample_rate,
                self.model_sample_rate,
                None,
            )
            .expect("Error during resample()");
        }
        let noisy = noisy.as_standard_layout();
        let mut enh: Array2<f32> = ArrayD::default(noisy.shape()).into_dimensionality()?;

        for (ns_f, enh_f) in noisy
            .view()
            .axis_chunks_iter(Axis(1), self.model.hop_size)
            .zip(
                enh.view_mut()
                    .axis_chunks_iter_mut(Axis(1), self.model.hop_size),
            )
        {
            if ns_f.len_of(Axis(1)) < self.model.hop_size {
                break;
            }
            self.model.process(ns_f, enh_f)?;
        }

        // if self.compensate_delay {
        //     enh.slice_axis_inplace(Axis(1), tract_core::ndarray::Slice::from(self.delay..));
        // }

        if self.model_sample_rate != self.stream_sample_rate {
            enh = resample(
                enh.view(),
                self.model_sample_rate,
                self.stream_sample_rate,
                None,
            )
            .expect("Error during resample()");
        }

        Ok(enh.view().to_slice().unwrap().to_vec())
    }

    pub async fn get_or_download_model(model_type: NoiseReductionModel) -> Result<PathBuf> {
        let (model_path, model_caller): (&Mutex<Option<PathBuf>>, &Once) = match model_type {
            NoiseReductionModel::V3 => (&*V3_MODEL_PATH, &DOWNLOAD_V3_ONCE),
            NoiseReductionModel::V3LL => (&*V3LL_MODEL_PATH, &DOWNLOAD_V3LL_ONCE),
        };

        let mut model_path = model_path.lock().await;
        if let Some(path) = model_path.as_ref() {
            debug!("using cached {} model: {:?}", model_type, path);
            return Ok(path.clone());
        }

        let cache_dir = NoiseFilter::get_cache_dir()?;
        let path = cache_dir.join(format!("{}.onnx", model_type));

        if path.exists() {
            debug!("found existing {} model at: {:?}", model_type, path);
            *model_path = Some(path.clone());
            return Ok(path);
        }

        info!("initiating {} model download...", model_type);
        model_caller.call_once(|| {
            tokio::spawn(async move {
                if let Err(e) = NoiseFilter::download_model(model_type).await {
                    debug!("error downloading {} model: {}", model_type, e);
                }
            });
        });

        while !path.exists() {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        *model_path = Some(path.clone());
        Ok(path)
    }

    async fn download_model(model_type: NoiseReductionModel) -> Result<()> {
        let (url, filename) = match model_type {
          NoiseReductionModel::V3 => (
              "https://github.com/mediar-ai/screenpipe/raw/refs/heads/main/screenpipe-audio/models/deep-filter-net/DeepFilterNet3_onnx.tar.gz",
              "DeepFilterNet3_onnx.tar.gz",
          ),
          NoiseReductionModel::V3LL => (
              "https://github.com/mediar-ai/screenpipe/raw/refs/heads/main/screenpipe-audio/models/deep-filter-net/DeepFilterNet3_ll_onnx.tar.gz",
              "DeepFilterNet3_ll_onnx.tar.gz",
          ),
      };

        info!("downloading {} model from {}", filename, url);
        let response = reqwest::get(url).await?;
        let model_data = response.bytes().await?;

        let cache_dir = NoiseFilter::get_cache_dir()?;
        tokio::fs::create_dir_all(&cache_dir).await?;
        let path = cache_dir.join(filename);

        info!(
            "saving {} model ({} bytes) to {:?}",
            filename,
            model_data.len(),
            path
        );
        let mut file = tokio::fs::File::create(&path).await?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &model_data).await?;
        info!("{} model successfully downloaded and saved", filename);

        Ok(())
    }

    fn get_cache_dir() -> Result<PathBuf> {
        let proj_dirs =
            dirs::cache_dir().ok_or_else(|| anyhow::anyhow!("failed to get cache dir"))?;
        Ok(proj_dirs.join("screenpipe").join("models"))
    }
}
