/// Audio Transcription Duplicate Prevention Test
///
/// This test verifies that the UNIQUE constraint on (audio_chunk_id, transcription)
/// prevents duplicate audio transcriptions from being inserted.
///
/// Run with: cargo test --package screenpipe-db --test audio_duplicate_test -- --nocapture

#[cfg(test)]
mod tests {
    use screenpipe_db::{AudioDevice, DatabaseManager, DeviceType};

    async fn setup_test_db() -> DatabaseManager {
        let db = DatabaseManager::new("sqlite::memory:").await.unwrap();

        match sqlx::migrate!("./src/migrations").run(&db.pool).await {
            Ok(_) => {}
            Err(e) => {
                eprintln!("Migration error: {:?}", e);
                panic!("Database migration failed: {}", e);
            }
        }

        db
    }

    /// Verify the UNIQUE constraint exists after migration
    #[tokio::test]
    async fn test_unique_constraint_exists() {
        let db = setup_test_db().await;

        // Check that the index exists
        let index_exists: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_audio_transcription_chunk_text'"
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();

        assert_eq!(index_exists.0, 1, "UNIQUE index should exist after migration");
        println!("✓ UNIQUE constraint idx_audio_transcription_chunk_text exists");
    }

    /// Test that INSERT OR IGNORE prevents exact duplicates
    #[tokio::test]
    async fn test_duplicate_insert_is_ignored() {
        let db = setup_test_db().await;

        let device = AudioDevice {
            name: "MacBook Pro Microphone".to_string(),
            device_type: DeviceType::Input,
        };

        let chunk_id = db.insert_audio_chunk("test_audio.mp4").await.unwrap();

        // First insert should succeed and return a valid id
        let id1 = db.insert_audio_transcription(
            chunk_id,
            "So like if",
            0,
            "whisper",
            &device,
            Some(1),
            Some(0.0),
            Some(2.5),
        ).await.unwrap();

        assert!(id1 > 0, "First insert should return valid id");
        println!("✓ First insert returned id: {}", id1);

        // Second insert with SAME chunk_id and transcription should be ignored
        let id2 = db.insert_audio_transcription(
            chunk_id,
            "So like if",  // Same text
            0,
            "whisper",
            &device,
            Some(1),
            Some(5.0),     // Different time - doesn't matter
            Some(7.5),
        ).await.unwrap();

        // INSERT OR IGNORE returns 0 when the insert is ignored
        assert_eq!(id2, 0, "Duplicate insert should return 0 (ignored)");
        println!("✓ Duplicate insert returned 0 (correctly ignored)");

        // Verify only one row exists
        let count = db.count_audio_transcriptions(chunk_id).await.unwrap();
        assert_eq!(count, 1, "Should have exactly 1 transcription, not 2");
        println!("✓ Only 1 row in database (duplicate was prevented)");
    }

    /// Test that different transcriptions for the same chunk are allowed
    #[tokio::test]
    async fn test_different_transcriptions_same_chunk_allowed() {
        let db = setup_test_db().await;

        let device = AudioDevice {
            name: "MacBook Pro Microphone".to_string(),
            device_type: DeviceType::Input,
        };

        let chunk_id = db.insert_audio_chunk("test_audio.mp4").await.unwrap();

        // Insert first transcription
        let id1 = db.insert_audio_transcription(
            chunk_id,
            "Hello world",
            0,
            "whisper",
            &device,
            Some(1),
            Some(0.0),
            Some(2.5),
        ).await.unwrap();
        assert!(id1 > 0);

        // Insert DIFFERENT transcription for same chunk - should succeed
        let id2 = db.insert_audio_transcription(
            chunk_id,
            "Goodbye world",  // Different text
            0,
            "whisper",
            &device,
            Some(1),
            Some(2.5),
            Some(5.0),
        ).await.unwrap();
        assert!(id2 > 0);
        assert_ne!(id1, id2);

        let count = db.count_audio_transcriptions(chunk_id).await.unwrap();
        assert_eq!(count, 2, "Different transcriptions should both be inserted");
        println!("✓ Different transcriptions for same chunk are allowed (count: {})", count);
    }

    /// Test that same transcription in different chunks is allowed
    #[tokio::test]
    async fn test_same_transcription_different_chunks_allowed() {
        let db = setup_test_db().await;

        let device = AudioDevice {
            name: "MacBook Pro Microphone".to_string(),
            device_type: DeviceType::Input,
        };

        let chunk_id_1 = db.insert_audio_chunk("audio_1.mp4").await.unwrap();
        let chunk_id_2 = db.insert_audio_chunk("audio_2.mp4").await.unwrap();

        // Insert same transcription in different chunks - both should succeed
        let id1 = db.insert_audio_transcription(
            chunk_id_1,
            "Thank you",
            0,
            "whisper",
            &device,
            None,
            None,
            None,
        ).await.unwrap();
        assert!(id1 > 0);

        let id2 = db.insert_audio_transcription(
            chunk_id_2,
            "Thank you",  // Same text, different chunk
            0,
            "whisper",
            &device,
            None,
            None,
            None,
        ).await.unwrap();
        assert!(id2 > 0);

        println!("✓ Same transcription in different chunks is allowed (ids: {}, {})", id1, id2);
    }

    /// Test the production scenario that was causing duplicates
    #[tokio::test]
    async fn test_production_duplicate_scenario_prevented() {
        let db = setup_test_db().await;

        let device = AudioDevice {
            name: "MacBook Pro Microphone".to_string(),
            device_type: DeviceType::Input,
        };

        // Simulate the production bug:
        // audio_chunk_id 9994 had two records with transcription "So like if"
        // at different time ranges (21.56-29.54 and 29.86-31.97)
        let chunk_id = db.insert_audio_chunk("production_audio.mp4").await.unwrap();

        // First VAD segment produces "So like if"
        let id1 = db.insert_audio_transcription(
            chunk_id,
            "So like if",
            0,
            "whisper",
            &device,
            Some(1),
            Some(21.56),
            Some(29.54),
        ).await.unwrap();
        assert!(id1 > 0);

        // Second VAD segment (due to overlap) also produces "So like if"
        // This should now be IGNORED
        let id2 = db.insert_audio_transcription(
            chunk_id,
            "So like if",
            0,
            "whisper",
            &device,
            Some(1),
            Some(29.86),
            Some(31.97),
        ).await.unwrap();
        assert_eq!(id2, 0, "Duplicate should be ignored");

        // Verify only one row
        let count = db.count_audio_transcriptions(chunk_id).await.unwrap();
        assert_eq!(count, 1);

        println!("✓ Production duplicate scenario is now PREVENTED");
        println!("  - First 'So like if' inserted with id {}", id1);
        println!("  - Second 'So like if' was ignored (returned 0)");
        println!("  - Total count: {} (was 2 before fix)", count);
    }

    /// Test multiple rapid duplicate attempts (simulating race conditions)
    #[tokio::test]
    async fn test_rapid_duplicate_attempts() {
        let db = setup_test_db().await;

        let device = AudioDevice {
            name: "MacBook Pro Microphone".to_string(),
            device_type: DeviceType::Input,
        };

        let chunk_id = db.insert_audio_chunk("test.mp4").await.unwrap();

        // Try to insert the same transcription 10 times rapidly
        let mut successful_inserts = 0;
        for i in 0..10 {
            let id = db.insert_audio_transcription(
                chunk_id,
                "Repeated phrase",
                0,
                "whisper",
                &device,
                None,
                Some(i as f64),
                Some((i + 1) as f64),
            ).await.unwrap();

            if id > 0 {
                successful_inserts += 1;
            }
        }

        assert_eq!(successful_inserts, 1, "Only first insert should succeed");

        let count = db.count_audio_transcriptions(chunk_id).await.unwrap();
        assert_eq!(count, 1, "Should have exactly 1 row despite 10 attempts");

        println!("✓ 10 rapid duplicate attempts resulted in only 1 row");
    }

    /// Test that the deduplication SQL logic works correctly
    /// This verifies the migration's DELETE logic keeps the first row (lowest id)
    #[tokio::test]
    async fn test_migration_deduplication_logic() {
        let db = setup_test_db().await;

        // First, drop the unique index so we can insert duplicates for testing
        sqlx::query("DROP INDEX IF EXISTS idx_audio_transcription_chunk_text")
            .execute(&db.pool).await.unwrap();

        // Insert a chunk
        let chunk_id = sqlx::query("INSERT INTO audio_chunks (file_path) VALUES ('test.mp4')")
            .execute(&db.pool).await.unwrap()
            .last_insert_rowid();

        // Insert 3 duplicate transcriptions with different ids
        for i in 0..3 {
            sqlx::query(
                "INSERT INTO audio_transcriptions (audio_chunk_id, transcription, offset_index, timestamp, start_time, end_time)
                 VALUES (?, 'Duplicate text', 0, datetime('now'), ?, ?)"
            )
            .bind(chunk_id)
            .bind(i as f64)
            .bind((i + 1) as f64)
            .execute(&db.pool).await.unwrap();
        }

        // Verify we have 3 rows
        let count_before: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audio_transcriptions WHERE audio_chunk_id = ?")
            .bind(chunk_id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(count_before.0, 3);
        println!("Before deduplication: {} rows", count_before.0);

        // Get the ids before dedup
        let ids_before: Vec<(i64,)> = sqlx::query_as("SELECT id FROM audio_transcriptions WHERE audio_chunk_id = ? ORDER BY id")
            .bind(chunk_id)
            .fetch_all(&db.pool).await.unwrap();
        let first_id = ids_before[0].0;
        println!("IDs before dedup: {:?}", ids_before.iter().map(|r| r.0).collect::<Vec<_>>());

        // Run the deduplication logic using a subquery (simpler than temp table)
        // This is equivalent to what the migration does
        sqlx::query(
            "DELETE FROM audio_transcriptions
             WHERE id NOT IN (
                SELECT MIN(id)
                FROM audio_transcriptions
                GROUP BY audio_chunk_id, transcription
             )"
        ).execute(&db.pool).await.unwrap();

        // Verify deduplication worked
        let count_after: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audio_transcriptions WHERE audio_chunk_id = ?")
            .bind(chunk_id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(count_after.0, 1);
        println!("After deduplication: {} rows", count_after.0);

        // Verify the first row (lowest id) was kept
        let kept_row: (i64,) = sqlx::query_as("SELECT id FROM audio_transcriptions WHERE audio_chunk_id = ?")
            .bind(chunk_id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(kept_row.0, first_id, "Should keep the row with lowest id");

        println!("✓ Deduplication logic correctly reduced {} -> {} rows, kept id {}", count_before.0, count_after.0, first_id);
    }

    /// Test no errors when no duplicates exist
    #[tokio::test]
    async fn test_no_error_when_no_duplicates() {
        let db = setup_test_db().await;

        let device = AudioDevice {
            name: "Test".to_string(),
            device_type: DeviceType::Input,
        };

        // Insert unique transcriptions
        for i in 0..5 {
            let chunk_id = db.insert_audio_chunk(&format!("audio_{}.mp4", i)).await.unwrap();
            let id = db.insert_audio_transcription(
                chunk_id,
                &format!("Unique transcription {}", i),
                0,
                "whisper",
                &device,
                None,
                None,
                None,
            ).await.unwrap();
            assert!(id > 0, "Unique insert should succeed");
        }

        // Count total
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audio_transcriptions")
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(count.0, 5);
        println!("✓ 5 unique transcriptions inserted successfully");
    }

    /// Summary test showing before/after behavior
    #[tokio::test]
    async fn test_summary_before_after() {
        let db = setup_test_db().await;

        let device = AudioDevice {
            name: "MacBook Pro Microphone".to_string(),
            device_type: DeviceType::Input,
        };

        let chunk_id = db.insert_audio_chunk("test.mp4").await.unwrap();

        println!("\n=== DUPLICATE PREVENTION SUMMARY ===");
        println!("Attempting to insert 'So like if' 3 times for same chunk...\n");

        let mut ids = Vec::new();
        for i in 0..3 {
            let id = db.insert_audio_transcription(
                chunk_id,
                "So like if",
                0,
                "whisper",
                &device,
                Some(1),
                Some(i as f64 * 10.0),
                Some((i + 1) as f64 * 10.0),
            ).await.unwrap();
            println!("  Insert attempt {}: returned id = {}", i + 1, id);
            ids.push(id);
        }

        let count = db.count_audio_transcriptions(chunk_id).await.unwrap();

        println!("\nResults:");
        println!("  - First insert: id = {} (SUCCESS)", ids[0]);
        println!("  - Second insert: id = {} (IGNORED - duplicate)", ids[1]);
        println!("  - Third insert: id = {} (IGNORED - duplicate)", ids[2]);
        println!("  - Total rows in DB: {}", count);
        println!("\n✓ BEFORE FIX: Would have 3 rows");
        println!("✓ AFTER FIX: Only 1 row (duplicates prevented)");

        assert_eq!(count, 1);
        assert!(ids[0] > 0);
        assert_eq!(ids[1], 0);
        assert_eq!(ids[2], 0);
    }
}
