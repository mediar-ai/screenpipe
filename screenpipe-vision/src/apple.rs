use image::DynamicImage;
use std::ffi::CStr;
use std::os::raw::{c_char, c_uchar};

#[link(name = "ocr")]
extern "C" {
    fn perform_ocr(
        image_data: *const c_uchar,
        length: usize,
        width: i32,
        height: i32,
    ) -> *mut c_char;
}

pub fn perform_ocr_apple(image: &DynamicImage) -> String {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let raw_data = rgba.as_raw();

    unsafe {
        let result_ptr = perform_ocr(
            raw_data.as_ptr(),
            raw_data.len(),
            width as i32,
            height as i32,
        );
        let result = CStr::from_ptr(result_ptr).to_string_lossy().into_owned();
        libc::free(result_ptr as *mut libc::c_void);
        result
    }
}
