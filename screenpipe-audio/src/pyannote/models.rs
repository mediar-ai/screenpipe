use anyhow::Result;
use dirs;
use lazy_static::lazy_static;
use log::{debug, info};
use std::path::PathBuf;
use std::sync::Once;
use tokio::sync::Mutex;

lazy_static! {
    static ref SEGMENTATION_MODEL_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
    static ref EMBEDDING_MODEL_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
}

static DOWNLOAD_SEGMENTATION_ONCE: Once = Once::new();
static DOWNLOAD_EMBEDDING_ONCE: Once = Once::new();

pub async fn get_or_download_model(model_type: PyannoteModel) -> Result<PathBuf> {
    match model_type {
        PyannoteModel::Segmentation => {
            let mut model_path = SEGMENTATION_MODEL_PATH.lock().await;
            if let Some(path) = model_path.as_ref() {
                debug!("using cached segmentation model: {:?}", path);
                return Ok(path.clone());
            }

            let cache_dir = get_cache_dir()?;
            let path = cache_dir.join("segmentation-3.0.onnx");

            if path.exists() {
                debug!("found existing segmentation model at: {:?}", path);
                *model_path = Some(path.clone());
                return Ok(path);
            }

            info!("initiating segmentation model download...");
            DOWNLOAD_SEGMENTATION_ONCE.call_once(|| {
                tokio::spawn(async move {
                    if let Err(e) = download_model(PyannoteModel::Segmentation).await {
                        debug!("error downloading segmentation model: {}", e);
                    }
                });
            });

            while !path.exists() {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }

            *model_path = Some(path.clone());
            Ok(path)
        }
        PyannoteModel::Embedding => {
            let mut model_path = EMBEDDING_MODEL_PATH.lock().await;
            if let Some(path) = model_path.as_ref() {
                debug!("using cached embedding model: {:?}", path);
                return Ok(path.clone());
            }

            let cache_dir = get_cache_dir()?;
            let path = cache_dir.join("wespeaker_en_voxceleb_CAM++.onnx");

            if path.exists() {
                debug!("found existing embedding model at: {:?}", path);
                *model_path = Some(path.clone());
                return Ok(path);
            }

            info!("initiating embedding model download...");
            DOWNLOAD_EMBEDDING_ONCE.call_once(|| {
                tokio::spawn(async move {
                    if let Err(e) = download_model(PyannoteModel::Embedding).await {
                        debug!("error downloading embedding model: {}", e);
                    }
                });
            });

            while !path.exists() {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }

            *model_path = Some(path.clone());
            Ok(path)
        }
    }
}

pub enum PyannoteModel {
    Segmentation,
    Embedding,
}

async fn download_model(model_type: PyannoteModel) -> Result<()> {
    let (url, filename) = match model_type {
        PyannoteModel::Segmentation => (
            "https://github.com/mediar-ai/screenpipe/raw/refs/heads/main/screenpipe-audio/models/pyannote/segmentation-3.0.onnx",
            "segmentation-3.0.onnx",
        ),
        PyannoteModel::Embedding => (
            "https://github.com/mediar-ai/screenpipe/raw/refs/heads/main/screenpipe-audio/models/pyannote/wespeaker_en_voxceleb_CAM++.onnx",
            "wespeaker_en_voxceleb_CAM++.onnx",
        ),
    };

    info!("downloading {} model from {}", filename, url);
    let response = reqwest::get(url).await?;
    let model_data = response.bytes().await?;

    let cache_dir = get_cache_dir()?;
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
    let proj_dirs = dirs::cache_dir().ok_or_else(|| anyhow::anyhow!("failed to get cache dir"))?;
    Ok(proj_dirs.join("screenpipe").join("models"))
}
