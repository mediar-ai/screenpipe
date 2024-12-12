#[cfg(target_os = "macos")]
pub mod apple;
pub mod core;
#[cfg(target_os = "macos")]
pub mod run_ui_monitoring_macos;
#[cfg(target_os = "windows")]
pub mod microsoft;
pub mod monitor;
pub mod tesseract;
pub mod utils;
#[cfg(target_os = "windows")]
pub mod run_ui_monitoring_windows;

#[cfg(target_os = "macos")]
pub use apple::{parse_apple_ocr_result, perform_ocr_apple};
pub use core::{continuous_capture, process_ocr_task, CaptureResult};
pub use utils::OcrEngine;
pub mod capture_screenshot_by_window;
#[cfg(target_os = "macos")]
pub use run_ui_monitoring_macos::run_ui;

#[cfg(target_os = "windows")]
pub use microsoft::perform_ocr_windows;
pub use tesseract::perform_ocr_tesseract;
#[cfg(target_os = "windows")]
pub use run_ui_monitoring_windows::run_ui;

