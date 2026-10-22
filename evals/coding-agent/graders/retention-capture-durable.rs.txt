// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
// Eval-only control copied from the pinned historical regression test.
    #[tokio::test]
    async fn all_retention_yields_archived_history_to_durable_capture() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("db.sqlite");
        let config = screenpipe_config::DbConfig {
            write_pool_max: 1,
            ..Default::default()
        };
        let db = DatabaseManager::new(path.to_str().unwrap(), config.clone())
            .await
            .unwrap();
        db.execute_raw_sql_write("WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<1000) INSERT INTO frames(id,timestamp,full_text) SELECT i,strftime('%Y-%m-%dT%H:%M:%fZ','2026-10-12T20:00:00Z','+'||i||' seconds'),'retention fixture' FROM n; WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<100000) INSERT INTO elements(id,frame_id,source,role,text,sort_order) SELECT i,1+(i-1)/100,'accessibility','AXText','old element '||i,i FROM n; INSERT INTO display_layout(timestamp,layout_json) SELECT timestamp,'[]' FROM frames;").await.unwrap();
        db.close().await;
        screenpipe_db::storage::migrate(root.path(), config.clone(), Default::default())
            .await
            .unwrap();
        let db = Arc::new(
            DatabaseManager::new(path.to_str().unwrap(), config.clone())
                .await
                .unwrap(),
        );
        let entered = Arc::new(tokio::sync::Notify::new());
        // Observe real SQL work after retention owns the writer, rather than
        // racing a sleep against fixture startup. The connection owns the hook.
        {
            let writer = db.coordinated_writer().lock().await.unwrap();
            let mut conn = writer.pool().acquire().await.unwrap();
            let mut handle = conn.lock_handle().await.unwrap();
            let entered = entered.clone();
            handle.set_progress_handler(1000, move || {
                entered.notify_one();
                true
            });
        }
        let old = db.clone();
        let cleanup = tokio::spawn(async move {
            do_local_cleanup(
                &old,
                "2026-10-12T20:00:00Z".parse().unwrap(),
                "2026-10-12T21:00:00Z".parse().unwrap(),
                RetentionMode::All,
            )
            .await
            .unwrap()
        });
        tokio::time::timeout(std::time::Duration::from_secs(15), entered.notified())
            .await
            .expect("retention cleanup must begin processing within 15 seconds");
        let mut longest = std::time::Duration::ZERO;
        let mut captured = 0;
        // Keep recording throughout the entire cleanup, including later
        // archive files and commits, rather than testing only its first slice.
        while !cleanup.is_finished() {
            let started = std::time::Instant::now();
            // Match event-driven capture's existing 15-second request deadline.
            tokio::time::timeout(
                std::time::Duration::from_secs(15),
                db.insert_snapshot_frame(
                    "live-test",
                    Utc::now(),
                    "",
                    None,
                    None,
                    None,
                    true,
                    None,
                    Some("new durable capture"),
                    None,
                    None,
                    None,
                    None,
                ),
            )
            .await
            .expect("retention blocked live capture past its deadline")
            .unwrap();
            longest = longest.max(started.elapsed());
            captured += 1;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
        assert!(captured > 0);
        let (deleted, watermark) = cleanup.await.unwrap();
        assert_eq!(deleted, 1000);
        assert_eq!(
            watermark,
            "2026-10-12T21:00:00Z".parse::<DateTime<Utc>>().unwrap()
        );
        println!("retention over 100000 archived elements: maximum concurrent capture latency={longest:?}; durable captures={captured}");
        {
            let writer = db.coordinated_writer().lock().await.unwrap();
            let mut conn = writer.pool().acquire().await.unwrap();
            let mut handle = conn.lock_handle().await.unwrap();
            handle.remove_progress_handler();
        }
        db.close().await;
        let reopened = DatabaseManager::new(path.to_str().unwrap(), config)
            .await
            .unwrap();
        let captures: i64 = sqlx::query_scalar("SELECT count(*) FROM frames")
            .fetch_one(&reopened.pool)
            .await
            .unwrap();
        assert_eq!(captures, captured);
        let elements: i64 = sqlx::query_scalar("SELECT count(*) FROM elements")
            .fetch_one(&reopened.pool)
            .await
            .unwrap();
        assert_eq!(elements, 0);
        let layouts: i64 = sqlx::query_scalar("SELECT count(*) FROM display_layout")
            .fetch_one(&reopened.pool)
            .await
            .unwrap();
        assert_eq!(
            layouts, 1,
            "slicing must preserve the existing latest-layout rule"
        );
        reopened.close().await;
    }
