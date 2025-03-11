use thiserror::Error;

#[derive(Error, Debug)]
pub enum AutomationError {
    #[error("Element not found: {0}")]
    ElementNotFound(String),

    #[error("Operation timed out: {0}")]
    Timeout(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Platform-specific error: {0}")]
    PlatformError(String),

    #[error("Unsupported operation: {0}")]
    UnsupportedOperation(String),

    #[error("Unsupported platform: {0}")]
    UnsupportedPlatform(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Internal error: {0}")]
    Internal(String),
}
