#[cfg(test)]
mod tests {
    use screenpipe_server::{ContentType, DatabaseManager, SearchResult};

    async fn setup_test_db() -> DatabaseManager {
        DatabaseManager::new("sqlite::memory:").await.unwrap()
    }

    #[tokio::test]
    async fn test_insert_and_search_ocr() {
        let db = setup_test_db().await;
        let _ = db.insert_video_chunk("test_video.mp4").await.unwrap();
        let frame_id = db.insert_frame().await.unwrap();
        db.insert_ocr_text(frame_id, "Hello, world!").await.unwrap();

        let results = db.search("Hello", ContentType::OCR, 100, 0).await.unwrap();
        assert_eq!(results.len(), 1);
        if let SearchResult::OCR(ocr_result) = &results[0] {
            assert_eq!(ocr_result.ocr_text, "Hello, world!");
            assert_eq!(ocr_result.file_path, "test_video.mp4");
        } else {
            panic!("Expected OCR result");
        }
    }

    #[tokio::test]
    async fn test_insert_and_search_audio() {
        let db = setup_test_db().await;
        let audio_chunk_id = db.insert_audio_chunk("test_audio.mp3").await.unwrap();
        db.insert_audio_transcription(audio_chunk_id, "Hello from audio", 0)
            .await
            .unwrap();

        let results = db
            .search("audio", ContentType::Audio, 100, 0)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        if let SearchResult::Audio(audio_result) = &results[0] {
            assert_eq!(audio_result.transcription, "Hello from audio");
            assert_eq!(audio_result.file_path, "test_audio.mp3");
        } else {
            panic!("Expected Audio result");
        }
    }

    #[tokio::test]
    async fn test_search_all() {
        let db = setup_test_db().await;

        // Insert OCR data
        let _ = db.insert_video_chunk("test_video.mp4").await.unwrap();
        let frame_id = db.insert_frame().await.unwrap();
        db.insert_ocr_text(frame_id, "Hello from OCR")
            .await
            .unwrap();

        // Insert Audio data
        let audio_chunk_id = db.insert_audio_chunk("test_audio.mp3").await.unwrap();
        db.insert_audio_transcription(audio_chunk_id, "Hello from audio", 0)
            .await
            .unwrap();

        let results = db.search("Hello", ContentType::All, 100, 0).await.unwrap();
        assert_eq!(results.len(), 2);

        let ocr_count = results
            .iter()
            .filter(|r| matches!(r, SearchResult::OCR(_)))
            .count();
        let audio_count = results
            .iter()
            .filter(|r| matches!(r, SearchResult::Audio(_)))
            .count();

        assert_eq!(ocr_count, 1);
        assert_eq!(audio_count, 1);
    }
}
