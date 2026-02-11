#[cfg(test)]
mod timeline_performance_tests {
    use chrono::{Duration, Utc};
    use screenpipe_db::{AudioDevice, DatabaseManager, DeviceType, OcrEngine};
    use std::sync::Arc;
    use std::time::Instant;

    async fn setup_test_db() -> DatabaseManager {
        let _ = tracing_subscriber::fmt()
            .with_max_level(tracing::Level::INFO)
            .try_init();

        let db = DatabaseManager::new("sqlite::memory:").await.unwrap();

        sqlx::migrate!("./src/migrations")
            .run(&db.pool)
            .await
            .expect("Failed to run migrations");

        db
    }

    /// Helper to insert N frames with OCR data, simulating a day of screen recording
    async fn insert_frames_with_ocr(
        db: &DatabaseManager,
        count: usize,
        start_time: chrono::DateTime<Utc>,
    ) {
        // Insert video chunk first
        let _ = db
            .insert_video_chunk("test_video.mp4", "test_device")
            .await
            .unwrap();

        for i in 0..count {
            // Space frames 2 seconds apart (simulating 0.5 FPS recording)
            let timestamp = start_time + Duration::seconds(i as i64 * 2);

            let frame_id = db
                .insert_frame(
                    "test_device",
                    Some(timestamp), // Pass the timestamp!
                    None,
                    Some(&format!("App{}", i % 10)), // Rotate through 10 apps
                    Some(&format!("Window {}", i)),
                    false,
                    None,
                )
                .await
                .unwrap();

            // Simulate realistic OCR text - screens have LOTS of text
            // A typical screen capture with code editor, browser, etc can have 2000-5000 chars
            let ocr_text = format!(
                "Frame {} - Application: VSCode - Window: main.rs - screenpipe - \
                 fn main() {{ println!(\"Hello world\"); let x = 42; let y = compute_something(x); }} \
                 File Edit Selection View Go Run Terminal Help Explorer Search Source Control Run and Debug Extensions \
                 PROBLEMS OUTPUT DEBUG CONSOLE TERMINAL Ports {} issues {} info {} warnings \
                 Chrome - Gmail Inbox (42) - john@example.com - RE: Project Update - Meeting tomorrow at 3pm \
                 Slack - #engineering - Latest: Can someone review PR #{}? - Unread: 15 \
                 Finder - Documents/projects/screenpipe - 42 items, 1.2 GB available \
                 System Preferences - Displays - Built-in Retina Display - Resolution: Scaled \
                 Menu bar: File Edit View Insert Format Tools Extensions Help \
                 Status bar: Ln 42, Col 15 - Spaces: 4 - UTF-8 - LF - Rust - Formatted \
                 Terminal output: Compiling screenpipe v0.2.76 warning: unused variable \
                 Browser tabs: GitHub - screenpipe/screenpipe - Stack Overflow - rust async \
                 Dock: Finder Safari Chrome VSCode Slack Notion Calendar Spotify Terminal \
                 This additional text simulates more content that would typically be on screen {}",
                i, i % 100, i % 50, i % 20, i % 100, "x".repeat(500)
            );

            db.insert_ocr_text(frame_id, &ocr_text, "", Arc::new(OcrEngine::Tesseract))
                .await
                .unwrap();
        }
    }

    /// Helper to insert N audio transcriptions
    async fn insert_audio_transcriptions(
        db: &DatabaseManager,
        count: usize,
        _start_time: chrono::DateTime<Utc>,
    ) {
        for i in 0..count {
            let audio_chunk_id = db
                .insert_audio_chunk(&format!("audio_{}.mp4", i))
                .await
                .unwrap();

            let transcription = format!(
                "This is audio transcription number {}. The speaker is discussing project updates and deadlines. \
                 We need to finish the feature by next week.",
                i
            );

            db.insert_audio_transcription(
                audio_chunk_id,
                &transcription,
                0,
                "",
                &AudioDevice {
                    name: "default".to_string(),
                    device_type: DeviceType::Output,
                },
                None,
                None,
                None,
            )
            .await
            .unwrap();
        }
    }

    // =========================================================================
    // TEST: Reproduce slow timeline loading with realistic data volume
    // =========================================================================

    /// Test that simulates loading a full day of frames
    ///
    /// At 0.5 FPS recording for 8 hours = 14,400 frames
    /// This test uses a smaller set but measures the performance characteristics
    #[tokio::test]
    async fn test_find_video_chunks_performance_small() {
        let db = setup_test_db().await;
        let frame_count = 100; // Small test

        let start_time = Utc::now() - Duration::hours(1);
        let end_time = Utc::now();

        println!("\n=== SMALL DATASET TEST ({} frames) ===", frame_count);

        // Insert frames
        let insert_start = Instant::now();
        insert_frames_with_ocr(&db, frame_count, start_time).await;
        println!("Insert time: {:?}", insert_start.elapsed());

        // Time the find_video_chunks query (this is what the WebSocket handler calls)
        let query_start = Instant::now();
        let result = db.find_video_chunks(start_time, end_time).await.unwrap();
        let query_duration = query_start.elapsed();

        println!("Query time: {:?}", query_duration);
        println!("Frames returned: {}", result.frames.len());
        println!(
            "Average time per frame: {:?}",
            query_duration / frame_count as u32
        );

        // Assert reasonable performance
        assert!(
            query_duration.as_millis() < 1000,
            "Query took too long: {:?}",
            query_duration
        );
    }

    /// Test with medium dataset - simulates ~1 hour of recording
    #[tokio::test]
    async fn test_find_video_chunks_performance_medium() {
        let db = setup_test_db().await;
        let frame_count = 1000; // ~30 minutes at 0.5 FPS

        let start_time = Utc::now() - Duration::hours(1);
        let end_time = Utc::now();

        println!("\n=== MEDIUM DATASET TEST ({} frames) ===", frame_count);

        let insert_start = Instant::now();
        insert_frames_with_ocr(&db, frame_count, start_time).await;
        println!("Insert time: {:?}", insert_start.elapsed());

        let query_start = Instant::now();
        let result = db.find_video_chunks(start_time, end_time).await.unwrap();
        let query_duration = query_start.elapsed();

        println!("Query time: {:?}", query_duration);
        println!("Frames returned: {}", result.frames.len());
        println!(
            "Average time per frame: {:?}",
            query_duration / frame_count as u32
        );

        // This is where we expect to see slowdown
        if query_duration.as_millis() > 2000 {
            println!("WARNING: Query exceeds 2 second threshold - user will experience hang!");
        }
    }

    /// Test with large dataset - simulates a full day of recording
    /// This is the scenario that causes the customer's "loading timeline" hang
    #[tokio::test]
    async fn test_find_video_chunks_performance_large() {
        let db = setup_test_db().await;
        let frame_count = 5000; // ~2.5 hours at 0.5 FPS

        let start_time = Utc::now() - Duration::hours(8);
        let end_time = Utc::now();

        println!("\n=== LARGE DATASET TEST ({} frames) ===", frame_count);
        println!("This simulates a partial day of recording");

        let insert_start = Instant::now();
        insert_frames_with_ocr(&db, frame_count, start_time).await;
        println!("Insert time: {:?}", insert_start.elapsed());

        // Also add some audio
        insert_audio_transcriptions(&db, frame_count / 10, start_time).await;

        let query_start = Instant::now();
        let result = db.find_video_chunks(start_time, end_time).await.unwrap();
        let query_duration = query_start.elapsed();

        println!("Query time: {:?}", query_duration);
        println!("Frames returned: {}", result.frames.len());
        println!(
            "Average time per frame: {:?}",
            query_duration / frame_count as u32
        );

        // Calculate data size
        let estimated_json_size: usize = result
            .frames
            .iter()
            .map(|f| {
                f.ocr_entries
                    .iter()
                    .map(|e| e.text.len() + e.app_name.len() + e.window_name.len())
                    .sum::<usize>()
            })
            .sum();
        println!(
            "Estimated JSON payload size: {} KB",
            estimated_json_size / 1024
        );

        if query_duration.as_secs() > 5 {
            println!("CRITICAL: Query exceeds 5 seconds - this is the customer's hang!");
            println!("User is trapped in fullscreen overlay while this query runs.");
        }
    }

    // =========================================================================
    // TEST: Memory usage during sort operations
    // =========================================================================

    #[tokio::test]
    async fn test_sort_performance_on_large_result() {
        let db = setup_test_db().await;
        let frame_count = 3000;

        let start_time = Utc::now() - Duration::hours(4);
        let end_time = Utc::now();

        println!("\n=== SORT PERFORMANCE TEST ({} frames) ===", frame_count);

        insert_frames_with_ocr(&db, frame_count, start_time).await;

        // Get the chunks
        let mut chunks = db.find_video_chunks(start_time, end_time).await.unwrap();
        println!("Fetched {} frames", chunks.frames.len());

        // Time the sort operation (this is done in server.rs:2917-2922)
        let sort_start = Instant::now();
        chunks
            .frames
            .sort_by_key(|a| std::cmp::Reverse((a.timestamp, a.offset_index)));
        let sort_duration = sort_start.elapsed();

        println!("Sort time: {:?}", sort_duration);

        if sort_duration.as_millis() > 100 {
            println!("WARNING: Sort takes >100ms - this adds to perceived latency");
        }
    }

    // =========================================================================
    // TEST: Simulate full WebSocket flow
    // =========================================================================

    #[tokio::test]
    async fn test_simulate_websocket_frame_streaming() {
        let db = setup_test_db().await;
        let frame_count = 2000;

        let start_time = Utc::now() - Duration::hours(2);
        let end_time = Utc::now();

        println!(
            "\n=== WEBSOCKET SIMULATION TEST ({} frames) ===",
            frame_count
        );

        insert_frames_with_ocr(&db, frame_count, start_time).await;
        insert_audio_transcriptions(&db, frame_count / 10, start_time).await;

        // Simulate the full flow:
        // 1. Query database
        let query_start = Instant::now();
        let mut chunks = db.find_video_chunks(start_time, end_time).await.unwrap();
        let query_time = query_start.elapsed();

        // 2. Sort results
        let sort_start = Instant::now();
        chunks
            .frames
            .sort_by_key(|a| std::cmp::Reverse((a.timestamp, a.offset_index)));
        let sort_time = sort_start.elapsed();

        // 3. Estimate data size (can't serialize FrameData directly)
        let total_ocr_chars: usize = chunks
            .frames
            .iter()
            .flat_map(|f| f.ocr_entries.iter())
            .map(|e| e.text.len())
            .sum();

        let total_time = query_time + sort_time;

        println!("Query time:      {:?}", query_time);
        println!("Sort time:       {:?}", sort_time);
        println!("TOTAL TIME:      {:?}", total_time);
        println!("Total OCR chars: {} KB", total_ocr_chars / 1024);

        if total_time.as_secs() > 3 {
            println!("\nCRITICAL: Total processing time > 3 seconds");
            println!("This explains the 'loading timeline' hang the customer experiences.");
            println!("\nBreakdown:");
            println!(
                "  - DB query: {:.1}%",
                query_time.as_millis() as f64 / total_time.as_millis() as f64 * 100.0
            );
            println!(
                "  - Sorting:  {:.1}%",
                sort_time.as_millis() as f64 / total_time.as_millis() as f64 * 100.0
            );
        }
    }

    // =========================================================================
    // TEST: What happens with a real day of data (estimated)
    // =========================================================================

    #[tokio::test]
    async fn test_estimate_full_day_performance() {
        let db = setup_test_db().await;

        // Full day at 0.5 FPS = 43,200 frames
        // We'll test with 1000 and extrapolate
        let sample_count = 1000;

        let start_time = Utc::now() - Duration::hours(1);
        let end_time = Utc::now();

        println!("\n=== FULL DAY ESTIMATION TEST ===");
        println!("Sample size: {} frames", sample_count);

        insert_frames_with_ocr(&db, sample_count, start_time).await;

        let query_start = Instant::now();
        let result = db.find_video_chunks(start_time, end_time).await.unwrap();
        let query_duration = query_start.elapsed();

        // Extrapolate to full day (8 hours active recording)
        let full_day_frames = 8 * 60 * 60 / 2; // 14,400 frames at 0.5 FPS
        let extrapolated_time_ms =
            (query_duration.as_millis() as f64 / sample_count as f64) * full_day_frames as f64;

        println!("Sample query time: {:?}", query_duration);
        println!("Frames in sample: {}", result.frames.len());
        println!("\nExtrapolated for full day ({} frames):", full_day_frames);
        println!(
            "  Estimated query time: {:.1} seconds",
            extrapolated_time_ms / 1000.0
        );

        if extrapolated_time_ms > 10000.0 {
            println!("\nCRITICAL: Full day query would take > 10 seconds!");
            println!("This is why the customer sees the app 'hang' on startup.");
            println!("\nRecommendations:");
            println!("  1. Add pagination (LIMIT/OFFSET) to query");
            println!("  2. Load only visible time range initially");
            println!("  3. Use lighter 'index' query without OCR text");
            println!("  4. Stream first 50 frames immediately, rest in background");
        }
    }

    // =========================================================================
    // TEST: File-based SQLite (closer to real conditions)
    // =========================================================================

    async fn setup_file_db(path: &str) -> DatabaseManager {
        let _ = tracing_subscriber::fmt()
            .with_max_level(tracing::Level::INFO)
            .try_init();

        // Remove if exists
        let _ = std::fs::remove_file(path);

        let db_url = format!("sqlite:{}", path);

        let db = DatabaseManager::new(&db_url).await.unwrap();

        sqlx::migrate!("./src/migrations")
            .run(&db.pool)
            .await
            .expect("Failed to run migrations");

        db
    }

    /// Test with file-based SQLite - closer to real customer experience
    #[tokio::test]
    async fn test_file_based_db_performance() {
        let db_path = "/tmp/screenpipe_test_perf.db";
        let db = setup_file_db(db_path).await;
        let frame_count = 3000; // ~1 hour at 0.5 FPS

        let start_time = Utc::now() - Duration::hours(2);
        let end_time = Utc::now();

        println!("\n=== FILE-BASED DB TEST ({} frames) ===", frame_count);
        println!("This simulates real file I/O conditions");

        let insert_start = Instant::now();
        insert_frames_with_ocr(&db, frame_count, start_time).await;
        insert_audio_transcriptions(&db, frame_count / 10, start_time).await;
        println!("Insert time: {:?}", insert_start.elapsed());

        // Force flush to disk
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&db.pool)
            .await
            .ok();

        let query_start = Instant::now();
        let result = db.find_video_chunks(start_time, end_time).await.unwrap();
        let query_duration = query_start.elapsed();

        println!("Query time: {:?}", query_duration);
        println!("Frames returned: {}", result.frames.len());

        // Run query multiple times to see if caching helps
        println!("\nRunning query 3 more times to check consistency:");
        for i in 1..=3 {
            let query_start = Instant::now();
            let _ = db.find_video_chunks(start_time, end_time).await.unwrap();
            println!("  Run {}: {:?}", i, query_start.elapsed());
        }

        if query_duration.as_millis() > 500 {
            println!("\nWARNING: Query > 500ms - user will notice delay");
        }

        // Cleanup
        let _ = std::fs::remove_file(db_path);
    }

    /// Test the actual query that's used (check if JOINs are the bottleneck)
    #[tokio::test]
    async fn test_query_without_ocr_join() {
        let db = setup_test_db().await;
        let frame_count = 3000;

        let start_time = Utc::now() - Duration::hours(2);
        let end_time = Utc::now();

        println!("\n=== QUERY COMPARISON TEST ({} frames) ===", frame_count);

        insert_frames_with_ocr(&db, frame_count, start_time).await;

        // Time the full query (with OCR join)
        let full_query_start = Instant::now();
        let _ = db.find_video_chunks(start_time, end_time).await.unwrap();
        let full_query_time = full_query_start.elapsed();

        // Time a simple query (frames only, no OCR)
        let simple_query = r#"
            SELECT f.id, f.timestamp, f.app_name
            FROM frames f
            WHERE f.timestamp >= ?1 AND f.timestamp <= ?2
            ORDER BY f.timestamp DESC
        "#;

        let simple_query_start = Instant::now();
        let _: Vec<(i64, chrono::DateTime<Utc>, Option<String>)> = sqlx::query_as(simple_query)
            .bind(start_time)
            .bind(end_time)
            .fetch_all(&db.pool)
            .await
            .unwrap();
        let simple_query_time = simple_query_start.elapsed();

        println!("Full query (with OCR join):  {:?}", full_query_time);
        println!("Simple query (no OCR):       {:?}", simple_query_time);
        println!(
            "OCR join overhead:           {:.1}x slower",
            full_query_time.as_micros() as f64 / simple_query_time.as_micros() as f64
        );

        if full_query_time.as_micros() > simple_query_time.as_micros() * 5 {
            println!("\nCRITICAL: OCR join is >5x slower than simple query!");
            println!(
                "Recommendation: Load timeline index first (no OCR), then load OCR on demand."
            );
        }
    }

    /// Test to see what happens with a very large time range (multiple days)
    #[tokio::test]
    async fn test_large_time_range_query() {
        let db = setup_test_db().await;

        // Insert frames spread across multiple "days"
        let frame_count = 2000;

        println!("\n=== LARGE TIME RANGE TEST ===");
        println!("Simulating frames spread across 7 days");

        // Insert frames over 7 days
        for day in 0..7 {
            let day_start = Utc::now() - Duration::days(7 - day);
            insert_frames_with_ocr(&db, frame_count / 7, day_start).await;
        }

        // Query for full week
        let start_time = Utc::now() - Duration::days(7);
        let end_time = Utc::now();

        let query_start = Instant::now();
        let result = db.find_video_chunks(start_time, end_time).await.unwrap();
        let query_duration = query_start.elapsed();

        println!("Query time for 7 days:  {:?}", query_duration);
        println!("Frames returned:        {}", result.frames.len());

        // Query for just today
        let today_start = Utc::now() - Duration::hours(24);
        let query_start = Instant::now();
        let result = db.find_video_chunks(today_start, end_time).await.unwrap();
        let today_query_time = query_start.elapsed();

        println!("Query time for today:   {:?}", today_query_time);
        println!("Frames returned:        {}", result.frames.len());

        println!(
            "\nTime range impact: 7-day query is {:.1}x slower than 1-day",
            query_duration.as_micros() as f64 / today_query_time.as_micros().max(1) as f64
        );
    }

    // =========================================================================
    // TEST: Stress test to find breaking point
    // =========================================================================

    /// This test tries to find when performance degrades significantly
    /// Run with: cargo test -p screenpipe-db --test timeline_performance_test test_stress -- --nocapture --ignored
    #[tokio::test]
    #[ignore] // Enable with --ignored flag
    async fn test_stress_find_breaking_point() {
        let db = setup_test_db().await;

        println!("\n=== STRESS TEST: Finding Breaking Point ===");
        println!("Testing with increasing frame counts...\n");

        let end_time = Utc::now();

        for frame_count in [100, 500, 1000, 2000, 5000, 10000, 20000] {
            let start_time = end_time - Duration::hours(frame_count as i64 / 1800 + 1);

            // Insert frames
            insert_frames_with_ocr(&db, frame_count, start_time).await;

            // Query
            let query_start = Instant::now();
            let result = db.find_video_chunks(start_time, end_time).await.unwrap();
            let query_time = query_start.elapsed();

            println!(
                "{:>6} frames: {:>8.2}ms  ({:>6.2}µs/frame)  [returned: {}]",
                frame_count,
                query_time.as_secs_f64() * 1000.0,
                query_time.as_micros() as f64 / frame_count as f64,
                result.frames.len()
            );

            if query_time.as_secs() > 5 {
                println!("\n** BREAKING POINT FOUND at {} frames **", frame_count);
                println!("Query time exceeds 5 seconds - this causes customer hang.");
                break;
            }
        }
    }
}
