#[cfg(test)]
mod tests {
    use axum::body::to_bytes;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::Router;
    use chrono::DateTime;
    use chrono::{Duration, Utc};
    use crossbeam::queue::SegQueue;
    use screenpipe_audio::{AudioDevice, DeviceType};
    use screenpipe_server::video_cache::FrameCache;
    use screenpipe_server::ContentType;
    use screenpipe_server::SearchResult;
    use screenpipe_server::{
        create_router, AppState, ContentItem, DatabaseManager, PaginatedResponse,
    };
    use screenpipe_server::{HealthCheckResponse, PipeManager};
    use screenpipe_vision::OcrEngine; // Adjust this import based on your actual module structure
    use serde::Deserialize;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use tower::ServiceExt; // for `oneshot` and `ready`

    // Before the test function, add:
    #[derive(Deserialize)]
    struct TestErrorResponse {
        error: String,
    }
    async fn setup_test_app() -> (Router, Arc<AppState>) {
        // env_logger::builder()
        //     .filter_level(LevelFilter::Debug)
        //     .init();
        let db = Arc::new(DatabaseManager::new("sqlite::memory:").await.unwrap());
        let app_state = Arc::new(AppState {
            db: db.clone(),
            vision_control: Arc::new(AtomicBool::new(false)),
            audio_devices_control: Arc::new(SegQueue::new()),
            devices_status: HashMap::new(),
            app_start_time: Utc::now(),
            screenpipe_dir: PathBuf::from(""),
            pipe_manager: Arc::new(PipeManager::new(PathBuf::from("")).0),
            vision_disabled: false,
            audio_disabled: false,
            frame_cache: Some(Arc::new(
                FrameCache::new(PathBuf::from(""), db).await.unwrap(),
            )),
            ui_monitoring_enabled: false,
        });

        let router = create_router();
        let app = router.with_state(app_state.clone());

        (app, app_state)
    }

    #[tokio::test]
    #[ignore] // TODO: fix - not priority rn
    async fn test_health_endpoint_initial_state() {
        let (app, _) = setup_test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let health_response: HealthCheckResponse = serde_json::from_slice(&body).unwrap();

        assert_eq!(health_response.status, "Loading");
        assert!(health_response.last_frame_timestamp.is_none());
        assert!(health_response.last_audio_timestamp.is_none());
        assert_eq!(health_response.frame_status, "Loading");
        assert_eq!(health_response.audio_status, "Loading");
        assert!(!health_response.message.is_empty());
    }

    #[tokio::test]
    #[ignore] // TODO: fix - not priority rn
    async fn test_health_endpoint_after_initialization() {
        let (app, _state) = setup_test_app().await;

        // Simulate passage of time
        tokio::time::sleep(tokio::time::Duration::from_secs(121)).await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let health_response: HealthCheckResponse = serde_json::from_slice(&body).unwrap();

        assert_eq!(health_response.status, "Unhealthy");
        assert!(health_response.last_frame_timestamp.is_none());
        assert!(health_response.last_audio_timestamp.is_none());
        assert_eq!(health_response.frame_status, "No data");
        assert_eq!(health_response.audio_status, "No data");
        assert!(!health_response.message.is_empty());
    }

    #[tokio::test]
    #[ignore] // TODO: fix - not priority rn
    async fn test_health_endpoint_with_recent_data() {
        let (app, state) = setup_test_app().await;
        let db = &state.db;

        // Simulate passage of time
        tokio::time::sleep(tokio::time::Duration::from_secs(120)).await;

        // Insert some recent data
        let _ = db
            .insert_video_chunk("test_video.mp4", "test_device")
            .await
            .unwrap();
        let frame_id = db.insert_frame("test_device", None).await.unwrap();
        let _ = db
            .insert_ocr_text(
                frame_id,
                "Test OCR",
                "",
                "",
                "",
                Arc::new(OcrEngine::Tesseract),
                false,
            )
            .await
            .unwrap();
        let audio_chunk_id = db.insert_audio_chunk("test_audio.wav").await.unwrap();
        let _ = db
            .insert_audio_transcription(
                audio_chunk_id,
                "Test Audio",
                0,
                "",
                &AudioDevice::new("test".to_string(), DeviceType::Input),
                None,
            )
            .await
            .unwrap();

        // Simulate passage of time
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let health_response: HealthCheckResponse = serde_json::from_slice(&body).unwrap();

        assert_eq!(health_response.status, "Healthy");
        assert!(health_response.last_frame_timestamp.is_some());
        assert!(health_response.last_audio_timestamp.is_some());
        assert_eq!(health_response.frame_status, "OK");
        assert_eq!(health_response.audio_status, "OK");
        assert!(!health_response.message.is_empty());
    }

    #[tokio::test]
    #[ignore] // TODO: fix - not priority rn
    async fn test_health_endpoint_with_stale_data() {
        let (app, state) = setup_test_app().await;
        let db = &state.db;

        // Insert some stale data (more than 60 seconds old)
        let stale_time = Utc::now() - Duration::seconds(61);
        let _ = db
            .insert_video_chunk("test_video.mp4", "test_device")
            .await
            .unwrap();
        let frame_id = db.insert_frame("test_device", None).await.unwrap();
        let _ = db
            .insert_ocr_text(
                frame_id,
                "Test OCR",
                "",
                "",
                "",
                Arc::new(OcrEngine::Tesseract),
                false,
            )
            .await
            .unwrap();
        let audio_chunk_id = db.insert_audio_chunk("test_audio.wav").await.unwrap();
        let _ = db
            .insert_audio_transcription(
                audio_chunk_id,
                "Test Audio",
                0,
                "",
                &AudioDevice::new("test".to_string(), DeviceType::Input),
                None,
            )
            .await
            .unwrap();

        // Manually update timestamps to make them stale
        sqlx::query("UPDATE frames SET timestamp = ?")
            .bind(stale_time)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("UPDATE audio_transcriptions SET timestamp = ?")
            .bind(stale_time)
            .execute(&db.pool)
            .await
            .unwrap();

        // Simulate passage of time
        tokio::time::sleep(tokio::time::Duration::from_secs(121)).await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let health_response: HealthCheckResponse = serde_json::from_slice(&body).unwrap();

        assert_eq!(health_response.status, "Unhealthy");
        assert!(health_response.last_frame_timestamp.is_some());
        assert!(health_response.last_audio_timestamp.is_some());
        assert_eq!(health_response.frame_status, "Stale");
        assert_eq!(health_response.audio_status, "Stale");
        assert!(!health_response.message.is_empty());
    }

    #[tokio::test]
    async fn test_search_audio_with_length_constraints() {
        let (app, state) = setup_test_app().await;
        let db = &state.db;

        // Insert some test data
        let _ = db.insert_audio_chunk("test_audio1.wav").await.unwrap();
        let audio_chunk_id1 = db.insert_audio_chunk("test_audio2.wav").await.unwrap();
        let audio_chunk_id2 = db.insert_audio_chunk("test_audio3.wav").await.unwrap();

        let _ = db
            .insert_audio_transcription(
                audio_chunk_id1,
                "Short",
                0,
                "",
                &AudioDevice::new("test1".to_string(), DeviceType::Input),
                None,
            )
            .await
            .unwrap();

        let _ = db
            .insert_audio_transcription(
                audio_chunk_id2,
                "This is a longer transcription with more words",
                0,
                "",
                &AudioDevice::new("test2".to_string(), DeviceType::Input),
                None,
            )
            .await
            .unwrap();

        // Test with min_length
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/search?content_type=audio&min_length=20")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        if response.status() != StatusCode::OK {
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let error_response: TestErrorResponse = serde_json::from_slice(&body).unwrap();
            panic!("Expected OK status, got: {}", error_response.error);
        }
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let search_response: PaginatedResponse<ContentItem> =
            serde_json::from_slice(&body).unwrap();
        assert_eq!(search_response.data.len(), 1);
        if let ContentItem::Audio(audio_item) = &search_response.data[0] {
            assert!(audio_item.transcription.len() >= 20);
        } else {
            panic!("Expected audio item");
        }

        // Test with max_length
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/search?content_type=audio&max_length=10")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let search_response: PaginatedResponse<ContentItem> =
            serde_json::from_slice(&body).unwrap();
        assert_eq!(search_response.data.len(), 1);

        // Test with both min_length and max_length
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/search?content_type=audio&min_length=5&max_length=30")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let search_response: PaginatedResponse<ContentItem> =
            serde_json::from_slice(&body).unwrap();
        assert_eq!(search_response.data.len(), 1);
        if let ContentItem::Audio(audio_item) = &search_response.data[0] {
            assert!(audio_item.transcription.len() >= 5);
            assert!(audio_item.transcription.len() <= 30);
        } else {
            panic!("Expected audio item");
        }
    }

    #[tokio::test]
    async fn test_count_search_results() {
        let (_, state) = setup_test_app().await;
        let db = &state.db;

        // Insert some test data
        let _ = db
            .insert_video_chunk("test_video1.mp4", "test_device")
            .await
            .unwrap();
        let frame_id1 = db.insert_frame("test_device", None).await.unwrap();
        let frame_id2 = db.insert_frame("test_device", None).await.unwrap();
        let _ = db
            .insert_ocr_text(
                frame_id1,
                "This is a test OCR text",
                "",
                "TestApp",
                "TestWindow",
                Arc::new(OcrEngine::Tesseract),
                false,
            )
            .await
            .unwrap();
        let _ = db
            .insert_ocr_text(
                frame_id2,
                "Another OCR text for testing",
                "",
                "TestApp2",
                "TestWindow2",
                Arc::new(OcrEngine::Tesseract),
                false,
            )
            .await
            .unwrap();

        let audio_chunk_id1 = db.insert_audio_chunk("test_audio1.wav").await.unwrap();
        let audio_chunk_id2 = db.insert_audio_chunk("test_audio2.wav").await.unwrap();
        let _ = db
            .insert_audio_transcription(
                audio_chunk_id1,
                "This is a test audio transcription",
                0,
                "",
                &AudioDevice::new("test1".to_string(), DeviceType::Input),
                None,
            )
            .await
            .unwrap();
        let _ = db
            .insert_audio_transcription(
                audio_chunk_id2,
                "Another audio transcription for testing",
                0,
                "",
                &AudioDevice::new("test2".to_string(), DeviceType::Input),
                None,
            )
            .await
            .unwrap();

        // Test counting all results
        let count = db
            .count_search_results("test", ContentType::All, None, None, None, None, None, None)
            .await
            .unwrap();
        assert_eq!(count, 4);

        // Test counting only OCR results
        let count = db
            .count_search_results("OCR", ContentType::OCR, None, None, None, None, None, None)
            .await
            .unwrap();
        assert_eq!(count, 2);

        // Test counting only Audio results
        let count = db
            .count_search_results(
                "audio",
                ContentType::Audio,
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(count, 2);

        // Test counting with app_name filter
        let count = db
            .count_search_results(
                "test",
                ContentType::All,
                None,
                None,
                Some("TestApp"),
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(count, 2);

        // Test counting with window_name filter
        let count = db
            .count_search_results(
                "test",
                ContentType::All,
                None,
                None,
                None,
                Some("TestWindow2"),
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(count, 1);

        // Test counting with min_length constraint
        let count = db
            .count_search_results(
                "test",
                ContentType::All,
                None,
                None,
                None,
                None,
                Some(30),
                None,
            )
            .await
            .unwrap();
        assert_eq!(count, 2);

        // Test counting with max_length constraint
        let count = db
            .count_search_results(
                "test",
                ContentType::All,
                None,
                None,
                None,
                None,
                None,
                Some(25),
            )
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn test_search_with_time_constraints() {
        let (_, state) = setup_test_app().await;
        let db = &state.db;

        // insert test data with different timestamps
        let _ = db
            .insert_video_chunk("test_video1.mp4", "test_device")
            .await
            .unwrap();
        let frame_id1 = db.insert_frame("test_device", None).await.unwrap();
        let audio_chunk_id1 = db.insert_audio_chunk("test_audio1.wav").await.unwrap();

        let now = DateTime::parse_from_rfc3339("2024-09-21T10:49:23.240367Z")
            .unwrap()
            .with_timezone(&Utc);
        let two_hours_ago = now - Duration::hours(2);

        // update timestamps for ocr and audio
        sqlx::query("UPDATE frames SET timestamp = ? WHERE id = ?")
            .bind(two_hours_ago)
            .bind(frame_id1)
            .execute(&db.pool)
            .await
            .unwrap();

        // insert ocr and audio data
        let _ = db
            .insert_ocr_text(
                frame_id1,
                "old ocr text",
                "",
                "testapp",
                "testwindow",
                Arc::new(OcrEngine::Tesseract),
                false,
            )
            .await
            .unwrap();

        let audio_transcription_id1 = db
            .insert_audio_transcription(
                audio_chunk_id1,
                "old audio transcription",
                0,
                "",
                &AudioDevice::new("test".to_string(), DeviceType::Input),
                None,
            )
            .await
            .unwrap();

        sqlx::query("UPDATE audio_transcriptions SET timestamp = ? WHERE id = ?")
            .bind(two_hours_ago)
            .bind(audio_transcription_id1)
            .execute(&db.pool)
            .await
            .unwrap();
        // test search with start_time constraint
        let ocr_results = db
            .search(
                "ocr",
                ContentType::OCR,
                10,
                0,
                Some(now - Duration::minutes(1)),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(ocr_results.len(), 0);

        let audio_results = db
            .search(
                "audio",
                ContentType::Audio,
                10,
                0,
                Some(now - Duration::minutes(1)),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(audio_results.len(), 0);

        // test search with end_time constraint
        let ocr_results = db
            .search(
                "ocr",
                ContentType::OCR,
                10,
                0,
                None,
                Some(now - Duration::minutes(10)),
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(ocr_results.len(), 1);
        if let SearchResult::OCR(ocr_result) = &ocr_results[0] {
            assert_eq!(ocr_result.ocr_text, "old ocr text");
        } else {
            panic!("expected ocr result");
        }

        let audio_results = db
            .search(
                "audio",
                ContentType::Audio,
                10,
                0,
                None,
                Some(now - Duration::minutes(10)),
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(audio_results.len(), 1);
        if let SearchResult::Audio(audio_result) = &audio_results[0] {
            assert_eq!(audio_result.transcription, "old audio transcription");
        } else {
            panic!("expected audio result");
        }

        // test count with time constraints
        let ocr_count = db
            .count_search_results(
                "ocr",
                ContentType::OCR,
                Some(two_hours_ago - Duration::minutes(1)),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(ocr_count, 1);

        let audio_count = db
            .count_search_results(
                "audio",
                ContentType::Audio,
                Some(two_hours_ago - Duration::minutes(100)),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(audio_count, 1);
    }
}
