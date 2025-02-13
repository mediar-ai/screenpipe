use std::path::Path;

use anyhow::Result;
use ort::{GraphOptimizationLevel, Session};

pub fn create_session<P: AsRef<Path>>(path: P, enable_memory_pattern: bool) -> Result<Session> {
    let session = Session::builder()?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_intra_threads(1)?
        .with_inter_threads(1)?
        .with_memory_pattern(enable_memory_pattern)?
        .commit_from_file(path.as_ref())?;
    Ok(session)
}
