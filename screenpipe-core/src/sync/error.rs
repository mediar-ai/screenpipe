//! Error types for cloud sync operations.

use thiserror::Error;

/// Result type for sync operations.
pub type SyncResult<T> = Result<T, SyncError>;

/// Errors that can occur during sync operations.
#[derive(Error, Debug)]
pub enum SyncError {
    /// Cryptographic operation failed
    #[error("crypto error: {0}")]
    Crypto(String),

    /// Key management error
    #[error("key error: {0}")]
    Key(String),

    /// Network/API error
    #[error("network error: {0}")]
    Network(String),

    /// Authentication failed
    #[error("authentication failed: {0}")]
    Auth(String),

    /// Server returned an error
    #[error("server error: {0}")]
    Server(String),

    /// Data serialization/deserialization error
    #[error("serialization error: {0}")]
    Serialization(String),

    /// Invalid or corrupted data
    #[error("data corruption: {0}")]
    DataCorruption(String),

    /// Quota exceeded
    #[error("quota exceeded: {0}")]
    QuotaExceeded(String),

    /// Device limit exceeded
    #[error("device limit exceeded")]
    DeviceLimitExceeded,

    /// No active subscription
    #[error("no active sync subscription")]
    NoSubscription,

    /// Blob not found
    #[error("blob not found: {0}")]
    NotFound(String),

    /// IO error
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

impl From<reqwest::Error> for SyncError {
    fn from(err: reqwest::Error) -> Self {
        SyncError::Network(err.to_string())
    }
}

impl From<serde_json::Error> for SyncError {
    fn from(err: serde_json::Error) -> Self {
        SyncError::Serialization(err.to_string())
    }
}

impl From<base64::DecodeError> for SyncError {
    fn from(err: base64::DecodeError) -> Self {
        SyncError::Serialization(format!("base64 decode error: {}", err))
    }
}
