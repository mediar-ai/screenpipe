pub mod core;
pub mod utils;
pub use core::{continuous_capture, process_ocr_task, CaptureResult, ControlMessage};
pub use utils::{perform_ocr_tesseract, OcrEngine};
