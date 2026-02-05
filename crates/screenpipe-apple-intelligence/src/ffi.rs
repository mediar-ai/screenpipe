//! Raw FFI bindings to the Swift bridge for Foundation Models.
//! These are unsafe C functions — use the safe wrappers in `engine.rs` instead.

use std::os::raw::c_char;

extern "C" {
    /// Check if Foundation Models is available on this system.
    /// Returns status code: 0=available, 1=not enabled, 2=not eligible, 3=not ready, 4=unknown
    /// Writes reason string to out_reason (caller must free with fm_free_string).
    pub fn fm_check_availability(out_reason: *mut *mut c_char) -> i32;

    /// Free a string allocated by the Swift side.
    pub fn fm_free_string(ptr: *mut c_char);

    /// Generate a plain text response from a prompt.
    /// Returns 0 on success, -1 on error.
    pub fn fm_generate_text(
        instructions: *const c_char,
        prompt: *const c_char,
        out_text: *mut *mut c_char,
        out_error: *mut *mut c_char,
        out_total_time_ms: *mut f64,
        out_mem_before: *mut u64,
        out_mem_after: *mut u64,
    ) -> i32;

    /// Generate a structured JSON response using a JSON schema.
    /// Returns 0 on success, -1 on error.
    pub fn fm_generate_json(
        instructions: *const c_char,
        prompt: *const c_char,
        json_schema: *const c_char,
        out_text: *mut *mut c_char,
        out_error: *mut *mut c_char,
        out_total_time_ms: *mut f64,
        out_mem_before: *mut u64,
        out_mem_after: *mut u64,
    ) -> i32;

    /// Prewarm the model (load assets into memory).
    /// Returns 0 on success, non-zero on error.
    pub fn fm_prewarm() -> i32;

    /// Get supported languages as a JSON array. Caller must free.
    pub fn fm_supported_languages() -> *mut c_char;
}
