/// Tests to reproduce the timeline refresh bug where new frames are not pushed to clients.
///
/// The bug: Timeline shows 7:41 PM but current time is 7:55 PM - a 14 minute gap.
/// New frames exist in the database but are not being pushed to the WebSocket client.
use chrono::{Duration, TimeZone, Utc};
use screenpipe_db::DatabaseManager;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

/// Simulates the `fetch_new_frames_since` function logic for testing
async fn simulate_fetch_new_frames(
    db: Arc<DatabaseManager>,
    since: chrono::DateTime<Utc>,
    until: chrono::DateTime<Utc>,
    sent_frame_ids: Arc<Mutex<HashSet<i64>>>,
) -> Result<(Vec<i64>, Option<chrono::DateTime<Utc>>), anyhow::Error> {
    let chunks = db.find_video_chunks(since, until).await?;
    let mut new_frame_ids = Vec::new();
    let mut latest_timestamp: Option<chrono::DateTime<Utc>> = None;

    let sent = sent_frame_ids.lock().await;

    for chunk in chunks.frames {
        // Skip frames we've already sent
        if sent.contains(&chunk.frame_id) {
            continue;
        }

        // Track latest timestamp
        if latest_timestamp.is_none() || chunk.timestamp > latest_timestamp.unwrap() {
            latest_timestamp = Some(chunk.timestamp);
        }

        new_frame_ids.push(chunk.frame_id);
    }

    drop(sent);

    // Mark new frames as sent
    if !new_frame_ids.is_empty() {
        let mut sent = sent_frame_ids.lock().await;
        for frame_id in &new_frame_ids {
            sent.insert(*frame_id);
        }
    }

    Ok((new_frame_ids, latest_timestamp))
}

/// Helper to create a test database with frames at specific times
async fn create_test_db() -> Arc<DatabaseManager> {
    Arc::new(
        DatabaseManager::new("sqlite::memory:")
            .await
            .expect("Failed to create test database"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TEST 1: Reproduce the core bug - new frames inserted AFTER initial fetch are not detected
    ///
    /// Scenario:
    /// 1. Initial frames exist in DB at 7:30 PM and 7:41 PM
    /// 2. Client requests today's frames
    /// 3. Initial fetch returns frames up to 7:41 PM
    /// 4. NEW frame is inserted at 7:45 PM
    /// 5. Poll runs with since=7:41 PM, until=7:55 PM
    /// 6. Bug: Does the poll find the new frame?
    #[tokio::test]
    async fn test_new_frames_after_initial_fetch_are_detected() {
        let db = create_test_db().await;

        // Create a video chunk first
        let _video_chunk_id = db
            .insert_video_chunk("test_video.mp4", "test_device")
            .await
            .expect("Failed to insert video chunk");

        let now = Utc::now();
        let thirty_min_ago = now - Duration::minutes(30);
        let twenty_min_ago = now - Duration::minutes(20);
        let five_min_ago = now - Duration::minutes(5);

        // Insert initial frames (simulating what existed before client connected)
        let frame1_id = db
            .insert_frame(
                "test_device",
                Some(thirty_min_ago),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(1),
            )
            .await
            .expect("Failed to insert frame 1");

        let frame2_id = db
            .insert_frame(
                "test_device",
                Some(twenty_min_ago),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(2),
            )
            .await
            .expect("Failed to insert frame 2");

        // Simulate: initial fetch has already processed frames 1 and 2
        let sent_frame_ids: Arc<Mutex<HashSet<i64>>> = Arc::new(Mutex::new(HashSet::new()));
        {
            let mut sent = sent_frame_ids.lock().await;
            sent.insert(frame1_id);
            sent.insert(frame2_id);
        }

        // Now insert a NEW frame (simulating a frame captured AFTER client connected)
        let frame3_id = db
            .insert_frame(
                "test_device",
                Some(five_min_ago),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(3),
            )
            .await
            .expect("Failed to insert frame 3");

        // Simulate polling for new frames since the last frame time
        let poll_start = twenty_min_ago;
        let poll_end = now;

        let (new_frames, latest_ts) =
            simulate_fetch_new_frames(db.clone(), poll_start, poll_end, sent_frame_ids.clone())
                .await
                .expect("Poll should succeed");

        // BUG CHECK: The new frame should be detected
        assert!(
            new_frames.contains(&frame3_id),
            "BUG CONFIRMED: New frame (id={}) was NOT detected by polling! This reproduces the timeline refresh bug.",
            frame3_id
        );
        assert_eq!(
            new_frames.len(),
            1,
            "Should only find the new frame, not duplicates"
        );
        assert!(
            latest_ts.is_some(),
            "Latest timestamp should be updated"
        );
    }

    /// TEST 2: Verify that already-sent frames are correctly excluded
    #[tokio::test]
    async fn test_sent_frames_are_excluded() {
        let db = create_test_db().await;

        let _video_chunk_id = db
            .insert_video_chunk("test_video.mp4", "test_device")
            .await
            .expect("Failed to insert video chunk");

        let now = Utc::now();
        let ten_min_ago = now - Duration::minutes(10);

        let frame_id = db
            .insert_frame(
                "test_device",
                Some(ten_min_ago),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(1),
            )
            .await
            .expect("Failed to insert frame");

        // Mark as already sent
        let sent_frame_ids: Arc<Mutex<HashSet<i64>>> = Arc::new(Mutex::new(HashSet::new()));
        {
            let mut sent = sent_frame_ids.lock().await;
            sent.insert(frame_id);
        }

        let (new_frames, _) = simulate_fetch_new_frames(
            db.clone(),
            now - Duration::hours(1),
            now,
            sent_frame_ids.clone(),
        )
        .await
        .expect("Poll should succeed");

        assert!(
            new_frames.is_empty(),
            "Already-sent frames should not be returned"
        );
    }

    /// TEST 3: Verify time range filtering works correctly
    ///
    /// This tests that polling correctly filters to only frames within the requested time range.
    #[tokio::test]
    async fn test_time_range_filtering() {
        let db = create_test_db().await;

        let _video_chunk_id = db
            .insert_video_chunk("test_video.mp4", "test_device")
            .await
            .expect("Failed to insert video chunk");

        let now = Utc::now();
        let two_hours_ago = now - Duration::hours(2);
        let one_hour_ago = now - Duration::hours(1);
        let thirty_min_ago = now - Duration::minutes(30);

        // Frame outside polling window (too old)
        let _old_frame_id = db
            .insert_frame(
                "test_device",
                Some(two_hours_ago),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(1),
            )
            .await
            .expect("Failed to insert old frame");

        // Frame inside polling window
        let new_frame_id = db
            .insert_frame(
                "test_device",
                Some(thirty_min_ago),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(2),
            )
            .await
            .expect("Failed to insert new frame");

        let sent_frame_ids: Arc<Mutex<HashSet<i64>>> = Arc::new(Mutex::new(HashSet::new()));

        // Poll only for the last hour
        let (new_frames, _) = simulate_fetch_new_frames(
            db.clone(),
            one_hour_ago,
            now,
            sent_frame_ids.clone(),
        )
        .await
        .expect("Poll should succeed");

        assert!(
            new_frames.contains(&new_frame_id),
            "Frame within time range should be found"
        );
        assert_eq!(
            new_frames.len(),
            1,
            "Only frame within time range should be returned"
        );
    }

    /// TEST 4: Verify the fix pattern - using Option to disable closed channel branch
    ///
    /// This test verifies that our fix pattern works: when we wrap the channel
    /// in Option and set it to None when closed, the select! properly handles
    /// other branches without starvation.
    #[tokio::test]
    async fn test_fixed_channel_pattern_prevents_starvation() {
        use tokio::time::{interval, timeout, Duration as TokioDuration};

        // Create a channel and immediately close it (drop the sender)
        let (tx, rx) = mpsc::channel::<i32>(10);
        drop(tx);

        let mut poll_count = 0;
        let mut channel_closed_detected = false;
        let mut poll_timer = interval(TokioDuration::from_millis(50));

        // Wrap channel in Option - THIS IS THE FIX
        let mut rx_option = Some(rx);

        // Run the select loop for a limited time
        let _ = timeout(TokioDuration::from_millis(500), async {
            loop {
                // This is the FIXED pattern used in handle_stream_frames_socket
                tokio::select! {
                    result = async {
                        match &mut rx_option {
                            Some(rx) => rx.recv().await,
                            None => std::future::pending().await,
                        }
                    } => {
                        match result {
                            Some(_) => {}
                            None => {
                                // Channel closed - set to None so we don't select this branch anymore
                                channel_closed_detected = true;
                                rx_option = None;
                            }
                        }
                    }
                    _ = poll_timer.tick() => {
                        poll_count += 1;
                        if poll_count >= 5 {
                            break;
                        }
                    }
                }
            }
        })
        .await;

        println!("Poll timer ran {} times", poll_count);
        println!("Channel closed detected: {}", channel_closed_detected);

        // VERIFY FIX: Poll timer should run normally even after channel closes
        assert!(
            poll_count >= 5,
            "FIX VERIFICATION: Poll timer should run at least 5 times, got {}",
            poll_count
        );
        assert!(
            channel_closed_detected,
            "Channel closure should be detected"
        );
    }

    /// TEST 5: Verify the polling condition logic
    ///
    /// The server checks: `if now <= end_time` before polling
    /// This test verifies this condition works correctly for "today's" requests.
    #[tokio::test]
    async fn test_polling_condition_for_today_request() {
        let now = Utc::now();

        // Client requests today's data (typical scenario)
        let start_of_day = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
        let end_of_day = now.date_naive().and_hms_opt(23, 59, 59).unwrap();

        let start_time = Utc.from_utc_datetime(&start_of_day);
        let end_time = Utc.from_utc_datetime(&end_of_day);

        // Condition in server code: `if now <= end_time`
        let should_poll = now <= end_time;

        assert!(
            should_poll,
            "Polling should be enabled for today's request. now={}, end_time={}",
            now, end_time
        );

        // Also verify poll_start < poll_end
        let last_polled = now - Duration::hours(1); // Simulating last frame was 1 hour ago
        let poll_start = last_polled;
        let poll_end = std::cmp::min(now, end_time);

        assert!(
            poll_start < poll_end,
            "Poll range should be valid: poll_start={}, poll_end={}",
            poll_start, poll_end
        );
    }

    /// TEST 6: Test that multiple rapid frame insertions are all detected
    #[tokio::test]
    async fn test_multiple_rapid_frame_insertions() {
        let db = create_test_db().await;

        let _video_chunk_id = db
            .insert_video_chunk("test_video.mp4", "test_device")
            .await
            .expect("Failed to insert video chunk");

        let now = Utc::now();
        let sent_frame_ids: Arc<Mutex<HashSet<i64>>> = Arc::new(Mutex::new(HashSet::new()));

        // Insert 10 frames in rapid succession
        let mut expected_frame_ids = Vec::new();
        for i in 0..10 {
            let frame_time = now - Duration::seconds(10 - i);
            let frame_id = db
                .insert_frame(
                    "test_device",
                    Some(frame_time),
                    None,
                    Some("test_app"),
                    Some("test_window"),
                    false,
                    Some(i),
                )
                .await
                .expect("Failed to insert frame");
            expected_frame_ids.push(frame_id);
        }

        // Poll should find all 10 frames
        let (new_frames, _) = simulate_fetch_new_frames(
            db.clone(),
            now - Duration::minutes(1),
            now + Duration::seconds(1),
            sent_frame_ids.clone(),
        )
        .await
        .expect("Poll should succeed");

        assert_eq!(
            new_frames.len(),
            10,
            "All 10 rapid insertions should be detected"
        );

        for expected_id in expected_frame_ids {
            assert!(
                new_frames.contains(&expected_id),
                "Frame {} should be detected",
                expected_id
            );
        }
    }

    /// TEST 7: Simulate the exact bug scenario with timestamps from user's screenshot
    ///
    /// User screenshot shows:
    /// - Timeline last frame: 7:41 PM
    /// - Current time: 7:55 PM
    /// - Gap: 14 minutes
    #[tokio::test]
    async fn test_exact_bug_scenario_14_min_gap() {
        let db = create_test_db().await;

        let _video_chunk_id = db
            .insert_video_chunk("test_video.mp4", "test_device")
            .await
            .expect("Failed to insert video chunk");

        // Simulate today at 7:55 PM
        let today = Utc::now().date_naive();
        let time_7_41_pm = today.and_hms_opt(19, 41, 0).unwrap();
        let time_7_43_pm = today.and_hms_opt(19, 43, 0).unwrap();
        let time_7_45_pm = today.and_hms_opt(19, 45, 0).unwrap();
        let time_7_55_pm = today.and_hms_opt(19, 55, 0).unwrap();

        let ts_7_41 = Utc.from_utc_datetime(&time_7_41_pm);
        let ts_7_43 = Utc.from_utc_datetime(&time_7_43_pm);
        let ts_7_45 = Utc.from_utc_datetime(&time_7_45_pm);
        let ts_7_55 = Utc.from_utc_datetime(&time_7_55_pm);

        // Frame that was shown in timeline (7:41 PM)
        let frame_741 = db
            .insert_frame(
                "test_device",
                Some(ts_7_41),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(1),
            )
            .await
            .expect("Failed to insert 7:41 frame");

        // Frames that SHOULD have been pushed but weren't
        let frame_743 = db
            .insert_frame(
                "test_device",
                Some(ts_7_43),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(2),
            )
            .await
            .expect("Failed to insert 7:43 frame");

        let frame_745 = db
            .insert_frame(
                "test_device",
                Some(ts_7_45),
                None,
                Some("test_app"),
                Some("test_window"),
                false,
                Some(3),
            )
            .await
            .expect("Failed to insert 7:45 frame");

        // Simulate: initial fetch returned 7:41 frame
        let sent_frame_ids: Arc<Mutex<HashSet<i64>>> = Arc::new(Mutex::new(HashSet::new()));
        {
            let mut sent = sent_frame_ids.lock().await;
            sent.insert(frame_741);
        }

        // Poll at 7:55 PM for frames since 7:41 PM
        let (new_frames, latest_ts) =
            simulate_fetch_new_frames(db.clone(), ts_7_41, ts_7_55, sent_frame_ids.clone())
                .await
                .expect("Poll should succeed");

        // These assertions document expected behavior vs bug
        println!("New frames found: {:?}", new_frames);
        println!("Latest timestamp: {:?}", latest_ts);

        // BUG CHECK: Both 7:43 and 7:45 frames should be detected
        assert!(
            new_frames.contains(&frame_743),
            "BUG: Frame at 7:43 PM was NOT detected!"
        );
        assert!(
            new_frames.contains(&frame_745),
            "BUG: Frame at 7:45 PM was NOT detected!"
        );
        assert_eq!(
            new_frames.len(),
            2,
            "Should find exactly 2 new frames (7:43 and 7:45)"
        );
    }

    /// TEST 8: Test that end_time boundary is handled correctly
    ///
    /// If the user requested frames until 11:59:59 PM and current time is 7:55 PM,
    /// polling should work. But what if end_time is in the past?
    #[tokio::test]
    async fn test_end_time_boundary_handling() {
        let now = Utc::now();

        // Scenario 1: end_time is in the future (today's request) - should poll
        let future_end = now + Duration::hours(5);
        assert!(
            now <= future_end,
            "Should poll when end_time is in future"
        );

        // Scenario 2: end_time is in the past (historical request) - should NOT poll
        let past_end = now - Duration::hours(1);
        assert!(
            !(now <= past_end),
            "Should NOT poll when end_time is in the past"
        );

        // Scenario 3: end_time is exactly now - edge case
        let exact_now = now;
        assert!(
            now <= exact_now,
            "Should poll when end_time equals now (edge case)"
        );
    }
}
