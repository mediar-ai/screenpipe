// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Native reader for Underdog Bark's ANS/LZMA compressed Parakeet weights.
//! No Python runtime, converted model, subprocess, or transcription server.

#[cfg(feature = "mlx")]
mod model;
pub mod weights;
#[cfg(feature = "mlx")]
pub use model::{BarkModel, MLX_LOCK};

pub const MODEL_REPO: &str = "ConwayResearch/Underdog-Bark-3.0";
pub const MODEL_REVISION: &str = "85db2ad18ab41e534a222ee253c29191d77ed919";
pub const MODEL_SHA256: &str = "c18de9418d73cbeb80b8c1287b392d480a56e191ef4a81d1baaa1b02e66d92ed";

/// Download immutable model assets, retaining upstream attribution in the cache.
pub fn download() -> anyhow::Result<std::path::PathBuf> {
    let api = hf_hub::api::sync::Api::new()?;
    let repo = api.repo(hf_hub::Repo::with_revision(
        MODEL_REPO.into(),
        hf_hub::RepoType::Model,
        MODEL_REVISION.into(),
    ));
    repo.get("NOTICE")?;
    repo.get("mlx/config.json")?;
    repo.get("model.bark").map_err(Into::into)
}

pub fn cached_model() -> Option<std::path::PathBuf> {
    // hf-hub 0.3 requires a refs/<revision> file even for an immutable SHA.
    // Newer Hub clients omit that ref. Read the pinned snapshot directly so
    // either client can populate the cache without repeated network requests.
    let repo = hf_hub::Repo::model(MODEL_REPO.into());
    let root = hf_hub::Cache::default()
        .path()
        .join(repo.folder_name())
        .join("snapshots")
        .join(MODEL_REVISION);
    ["mlx/config.json", "NOTICE", "model.bark"]
        .iter()
        .all(|f| root.join(f).is_file())
        .then(|| root.join("model.bark"))
}

/// Download on a background thread, keeping recording admission independent of
/// network/model availability. Refresh will retry a failed download later.
pub fn spawn_download() {
    use std::sync::atomic::{AtomicBool, Ordering};
    static RUNNING: AtomicBool = AtomicBool::new(false);
    if RUNNING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }
    std::thread::spawn(|| {
        struct Clear;
        impl Drop for Clear {
            fn drop(&mut self) {
                RUNNING.store(false, Ordering::Release);
            }
        }
        let _clear = Clear;
        if let Err(error) = download() {
            tracing::warn!("Bark download failed: {error:#}");
        }
    });
}
