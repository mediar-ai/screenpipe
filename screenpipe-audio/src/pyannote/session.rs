use std::path::Path;

use anyhow::Result;
use ort::{GraphOptimizationLevel, Session};

pub fn create_session<P: AsRef<Path>>(path: P) -> Result<Session> {
    let session = Session::builder()?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_intra_threads(1)?
        .with_inter_threads(1)?
        .commit_from_file(path.as_ref())?;
    Ok(session)
}