pub mod core;
pub mod utils;
pub use core::{continuous_capture, get_monitor, process_ocr_task, CaptureResult};
pub use utils::{perform_ocr_tesseract, OcrEngine};
