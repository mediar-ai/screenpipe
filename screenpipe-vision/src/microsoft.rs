use image::{DynamicImage, GenericImageView};
use anyhow::Result;

#[cfg(target_os = "windows")]
pub async fn perform_ocr_windows(image: &DynamicImage) -> Result<(String, String, Option<f64>)> {
    use std::io::Cursor;
    use windows::{
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine as WindowsOcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    };

    // Check image dimensions
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        // Return an empty result instead of panicking
        return Ok(("".to_string(), "[]".to_string(), None));
    }

    let mut buffer = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
        .map_err(|e| anyhow::anyhow!("Failed to write image to buffer: {}", e))?;

    let stream = InMemoryRandomAccessStream::new()?;
    let writer = DataWriter::CreateDataWriter(&stream)?;
    writer.WriteBytes(&buffer)?;
    writer.StoreAsync()?.get()?;
    writer.FlushAsync()?.get()?;
    stream.Seek(0)?;

    let decoder = BitmapDecoder::CreateWithIdAsync(BitmapDecoder::PngDecoderId()?, &stream)?
        .get()?;

    let bitmap = decoder.GetSoftwareBitmapAsync()?.get()?;

    let engine = WindowsOcrEngine::TryCreateFromUserProfileLanguages()?;
    let result = engine.RecognizeAsync(&bitmap)?.get()?;

    let text = result.Text()?.to_string();

    let json_output = serde_json::json!([{
        "text": text,
        "confidence": "1.0" // Windows OCR doesn't provide confidence scores
    }])
    .to_string();

    Ok((text, json_output, Some(1.0)))
}
