#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::Router;
    use axum::{body::to_bytes, routing::get};
    use chrono::{Duration, Utc};
    use crossbeam::queue::SegQueue;
    use screenpipe_server::{health_check, AppState, DatabaseManager};
    use screenpipe_server::{HealthCheckResponse, PipeManager};
    use screenpipe_vision::OcrEngine; // Adjust this import based on your actual module structure
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use tower::ServiceExt; // for `oneshot` and `ready`

    async fn setup_test_app() -> (Router, Arc<AppState>) {
        let db = Arc::new(DatabaseManager::new("sqlite::memory:").await.unwrap());
        let app_state = Arc::new(AppState {
            db: db.clone(),
            vision_control: Arc::new(AtomicBool::new(false)),
            audio_devices_control: Arc::new(SegQueue::new()),
            devices_status: HashMap::new(),
            app_start_time: Utc::now(),
            screenpipe_dir: PathBuf::from(""),
            pipe_manager: Arc::new(PipeManager::new(PathBuf::from(""))),
        });

        let app = Router::new()
            .route("/health", get(health_check))
            .with_state(app_state.clone());

        (app, app_state)
    }

    #[tokio::test]
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
    async fn test_health_endpoint_with_recent_data() {
        let (app, state) = setup_test_app().await;
        let db = &state.db;

        // Simulate passage of time
        tokio::time::sleep(tokio::time::Duration::from_secs(120)).await;

        // Insert some recent data
        let _ = db.insert_video_chunk("test_video.mp4").await.unwrap();
        let frame_id = db.insert_frame().await.unwrap();
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
            .insert_audio_transcription(audio_chunk_id, "Test Audio", 0, "")
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
    async fn test_health_endpoint_with_stale_data() {
        let (app, state) = setup_test_app().await;
        let db = &state.db;

        // Insert some stale data (more than 60 seconds old)
        let stale_time = Utc::now() - Duration::seconds(61);
        let _ = db.insert_video_chunk("test_video.mp4").await.unwrap();
        let frame_id = db.insert_frame().await.unwrap();
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
            .insert_audio_transcription(audio_chunk_id, "Test Audio", 0, "")
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
}
