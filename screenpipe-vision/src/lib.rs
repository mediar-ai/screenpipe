pub mod core;
mod utils;
pub use core::{continuous_capture, CaptureResult, ControlMessage};
pub use utils::perform_ocr;
