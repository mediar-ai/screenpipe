//! # screenpipe-apple-intelligence
//!
//! On-device AI processing using Apple's Foundation Models framework (macOS 26+).
//! Zero cloud, zero privacy concerns — all processing happens locally on Apple Silicon.
//!
//! This crate provides Rust bindings to the Foundation Models framework via Swift FFI.
//! It is only available on macOS 26.0+ with Apple Intelligence enabled.

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod ffi;

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod engine;

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub use engine::*;

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
compile_error!(
    "screenpipe-apple-intelligence requires macOS on Apple Silicon (aarch64). \
     Foundation Models framework is only available on macOS 26+ with Apple Silicon."
);
