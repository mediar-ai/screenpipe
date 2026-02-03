//! Data Migration Module
//!
//! Handles importing data from third-party screen recording applications.

pub mod rewind;

pub use rewind::{RewindMigration, RewindScanResult, MigrationProgress, MigrationState};
