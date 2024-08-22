#[cfg(target_os = "windows")]
pub async fn perform_ocr_windows(image: &DynamicImage) -> (String, String) {
    use std::io::Cursor;
    use windows::{
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine as WindowsOcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    };

    let mut buffer = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
        .unwrap();

    let stream = InMemoryRandomAccessStream::new().unwrap();
    let writer = DataWriter::CreateDataWriter(&stream).unwrap();
    writer.WriteBytes(&buffer).unwrap();
    writer.StoreAsync().unwrap().get().unwrap();
    writer.FlushAsync().unwrap().get().unwrap();
    stream.Seek(0).unwrap();

    let decoder = BitmapDecoder::CreateWithIdAsync(BitmapDecoder::PngDecoderId().unwrap(), &stream)
        .unwrap()
        .get()
        .unwrap();

    let bitmap = decoder.GetSoftwareBitmapAsync().unwrap().get().unwrap();

    let engine = WindowsOcrEngine::TryCreateFromUserProfileLanguages().unwrap();
    let result = engine.RecognizeAsync(&bitmap).unwrap().get().unwrap();

    let text = result.Text().unwrap().to_string();

    let json_output = serde_json::json!([{
        "text": text,
        "confidence": "n/a" // Windows OCR doesn't provide confidence scores, so we use a default high value
    }])
    .to_string();

    (text, json_output)
}
