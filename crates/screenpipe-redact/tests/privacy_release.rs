// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use screenpipe_db::{privacy_release::ReleasePolicy, DatabaseManager};
use screenpipe_redact::{Pipeline, Redactor};
use std::sync::Arc;

async fn database() -> (tempfile::TempDir, Arc<DatabaseManager>) {
    let root = tempfile::tempdir().unwrap();
    let db = Arc::new(
        DatabaseManager::new(
            root.path().join("db.sqlite").to_str().unwrap(),
            Default::default(),
        )
        .await
        .unwrap(),
    );
    db.configure_release(&ReleasePolicy {
        identity: "test:model-v1".into(),
        text: true,
        images: true,
    })
    .await
    .unwrap();
    (root, db)
}

#[tokio::test]
async fn pending_capture_is_durable_but_not_released_and_late_completion_is_not_lost() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2026-10-14T10:00:00Z','SYNTHETIC_SECRET_OLDER'),(2,'2026-10-14T10:01:00Z','SYNTHETIC_SECRET_NEWER')").await.unwrap();
    let protected = db.protected_reads().await.unwrap();
    let visible: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM frames")
        .fetch_one(&protected.pool)
        .await
        .unwrap();
    assert_eq!(visible, 0);
    assert!(protected
        .query_raw_sql("SELECT * FROM main.frames")
        .await
        .is_err());
    let mut jobs = db.release_pending("frames", 10).await.unwrap();
    assert_eq!(jobs.len(), 2);
    let newer = jobs.remove(0);
    let older = jobs.remove(0);
    let mut values = newer.values.clone();
    values.insert("full_text".into(), Some("newer sanitized".into()));
    assert!(db.publish_release(&newer, &values).await.unwrap());
    let first = db.ready_changes(0, 10).await.unwrap();
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].id, "2");
    let texts: Vec<String> = sqlx::query_scalar("SELECT full_text FROM frames ORDER BY id")
        .fetch_all(&protected.pool)
        .await
        .unwrap();
    assert_eq!(texts, vec!["newer sanitized"]);
    let mut values = older.values.clone();
    values.insert("full_text".into(), Some("older sanitized".into()));
    assert!(db.publish_release(&older, &values).await.unwrap());
    let second = db.ready_changes(first[0].sequence, 10).await.unwrap();
    assert_eq!(second.len(), 1);
    assert_eq!(second[0].id, "1");
    assert!(!db.release_ready("image", "1").await.unwrap());
    protected.close().await;
    db.close().await;
}

#[tokio::test]
async fn edits_and_policy_changes_reject_stale_detection_and_revoke_ready_reads() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write(
        "INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2026-10-14','pending')",
    )
    .await
    .unwrap();
    let old = db.release_pending("frames", 1).await.unwrap().remove(0);
    db.execute_raw_sql_write("UPDATE frames SET full_text='new private content' WHERE id=1")
        .await
        .unwrap();
    assert!(!db.publish_release(&old, &old.values).await.unwrap());
    let current = db.release_pending("frames", 1).await.unwrap().remove(0);
    assert!(db.publish_release(&current, &current.values).await.unwrap());
    let protected = db.protected_reads().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM frames")
            .fetch_one(&protected.pool)
            .await
            .unwrap(),
        1
    );
    db.configure_release(&ReleasePolicy {
        identity: "test:model-v2".into(),
        text: true,
        images: true,
    })
    .await
    .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM frames")
            .fetch_one(&protected.pool)
            .await
            .unwrap(),
        0
    );
    assert!(db.ready_changes(0, 10).await.unwrap().is_empty());
    protected.close().await;
    db.close().await;
}

#[tokio::test]
async fn regex_fallback_cannot_certify_required_model_processing() {
    let pipeline = Pipeline::regex_only();
    assert!(pipeline.redact_required("A").await.is_err());
    assert!(pipeline.redact_required("test@example.com").await.is_err());
}

#[tokio::test]
async fn privacy_export_admission_rejects_policy_change_but_accepts_new_completions() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write(
        "INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2026-10-14','pending')",
    )
    .await
    .unwrap();
    let token = db.storage_export_token().await.unwrap();
    let job = db.release_pending("frames", 1).await.unwrap().remove(0);
    assert!(db.publish_release(&job, &job.values).await.unwrap());
    assert!(
        token.admit(&db.pool).await.is_ok(),
        "new completion must not starve uploads"
    );
    db.configure_release(&ReleasePolicy {
        identity: "stricter-v2".into(),
        text: true,
        images: true,
    })
    .await
    .unwrap();
    assert!(token.admit(&db.pool).await.is_err());
    db.close().await;
}

#[tokio::test]
async fn hybrid_sealing_preserves_receipts_and_owner_close_drains_protected_pool() {
    let root = tempfile::tempdir().unwrap();
    let db = Arc::new(
        DatabaseManager::new_hybrid(root.path(), Default::default(), Default::default())
            .await
            .unwrap(),
    );
    db.configure_release(&ReleasePolicy {
        identity: "v1".into(),
        text: true,
        images: false,
    })
    .await
    .unwrap();
    db.execute_raw_sql_write(
        "INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2026-10-14','safe')",
    )
    .await
    .unwrap();
    let job = db.release_pending("frames", 1).await.unwrap().remove(0);
    assert!(db.publish_release(&job, &job.values).await.unwrap());
    let protected = db.protected_reads().await.unwrap();
    assert_eq!(db.seal_frame_payloads().await.unwrap(), 1);
    assert!(db.release_ready("frames", "1").await.unwrap());
    assert!(db.release_pending("frames", 1).await.unwrap().is_empty());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM frames")
            .fetch_one(&protected.pool)
            .await
            .unwrap(),
        1
    );
    db.close().await;
    assert!(protected.pool.is_closed());
}

#[tokio::test]
async fn image_queue_filters_age_before_limit_during_continuous_capture() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,name) VALUES(1,'2020-01-01T00:00:00Z','old.png'); WITH RECURSIVE ids(n) AS (SELECT 2 UNION ALL SELECT n+1 FROM ids WHERE n<50) INSERT INTO frames(id,timestamp,name) SELECT n,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'fresh.png' FROM ids").await.unwrap();
    let jobs = db.release_pending_aged("image", 16, 60).await.unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].id, "1");
    db.close().await;
}

#[tokio::test]
async fn metadata_edit_revokes_memory_and_primary_key_publication_is_indexed() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO memories(content,tags,source_context) VALUES('safe','[\"email@example.com\"]','private')").await.unwrap();
    let job = db.release_pending("memory", 1).await.unwrap().remove(0);
    assert!(job.values.contains_key("tags"));
    assert!(job.values.contains_key("source_context"));
    assert!(db.publish_release(&job, &job.values).await.unwrap());
    db.execute_raw_sql_write("UPDATE memories SET tags='[]' WHERE id=1")
        .await
        .unwrap();
    assert!(!db.release_ready("memory", "1").await.unwrap());
    let plan = sqlx::query("EXPLAIN QUERY PLAN UPDATE frames SET full_text=? WHERE id=?")
        .bind("safe")
        .bind("1")
        .fetch_all(&db.pool)
        .await
        .unwrap();
    use sqlx::Row;
    assert!(plan.iter().any(|row| row
        .get::<String, _>("detail")
        .contains("INTEGER PRIMARY KEY")));
    db.close().await;
}

#[tokio::test]
async fn unavailable_model_keeps_capture_durable_and_pending_after_restart() {
    let (root, db) = database().await;
    db.execute_raw_sql_write(
        "INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2026-10-14','short')",
    )
    .await
    .unwrap();
    let worker = screenpipe_redact::worker::Worker::new_with_writer(
        db.pool.clone(),
        db.coordinated_writer(),
        Arc::new(Pipeline::regex_only()),
        Default::default(),
    )
    .with_frame_storage(db.clone());
    assert_eq!(worker.process_release_batch(7).await.unwrap(), 0);
    assert!(!db.release_ready("frames", "1").await.unwrap());
    db.execute_raw_sql_write(
        "INSERT INTO frames(id,timestamp,full_text) VALUES(2,'2026-10-14','next capture')",
    )
    .await
    .unwrap();
    db.close().await;
    drop(worker);
    drop(db);
    let db = Arc::new(
        DatabaseManager::new(
            root.path().join("db.sqlite").to_str().unwrap(),
            Default::default(),
        )
        .await
        .unwrap(),
    );
    db.configure_release(&ReleasePolicy {
        identity: "test:model-v1".into(),
        text: true,
        images: true,
    })
    .await
    .unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM frames")
            .fetch_one(&db.pool)
            .await
            .unwrap(),
        2
    );
    let protected = db.protected_reads().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM frames")
            .fetch_one(&protected.pool)
            .await
            .unwrap(),
        0
    );
    db.close().await;
}

#[tokio::test]
async fn reenabling_same_policy_discovers_captures_made_while_disabled() {
    let (_root, db) = database().await;
    for kind in ["frames", "image"] {
        assert!(db.release_pending(kind, 1).await.unwrap().is_empty());
    }
    db.configure_release(&ReleasePolicy {
        identity: "test:model-v1".into(),
        text: false,
        images: false,
    })
    .await
    .unwrap();
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text,name) VALUES(1,'2020-01-01','private','old.png')").await.unwrap();
    db.configure_release(&ReleasePolicy {
        identity: "test:model-v1".into(),
        text: true,
        images: true,
    })
    .await
    .unwrap();
    for kind in ["frames", "image"] {
        assert_eq!(
            db.release_pending(kind, 1).await.unwrap().len(),
            1,
            "{kind}"
        );
    }
    db.close().await;
}

#[tokio::test]
async fn queue_discovery_is_bounded_and_policy_retry_deletion_and_status_are_consistent() {
    let (_root, db) = database().await;
    db.configure_release(&ReleasePolicy {
        identity: "test:model-v1".into(),
        text: false,
        images: false,
    })
    .await
    .unwrap();
    db.execute_raw_sql_write("WITH RECURSIVE ids(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM ids WHERE n<300) INSERT INTO frames(id,timestamp,full_text) SELECT n,'2020-01-01','synthetic' FROM ids").await.unwrap();
    db.configure_release(&ReleasePolicy {
        identity: "test:model-v1".into(),
        text: true,
        images: false,
    })
    .await
    .unwrap();
    let job = db.release_pending("frames", 1).await.unwrap().remove(0);
    let discovered: i64 =
        sqlx::query_scalar("SELECT after_id FROM _privacy_discovery WHERE kind='frames'")
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(discovered, 128);
    let status = db.release_queue_status().await.unwrap();
    assert!(
        status
            .surfaces
            .iter()
            .find(|s| s.kind == "frames")
            .unwrap()
            .discovering
    );
    assert!(db.publish_release(&job, &job.values).await.unwrap());
    db.configure_release(&ReleasePolicy {
        identity: "test:model-v2".into(),
        text: true,
        images: false,
    })
    .await
    .unwrap();
    let job = db
        .release_pending_ordered("frames", 1, 0, false)
        .await
        .unwrap()
        .remove(0);
    db.defer_release(&job).await.unwrap();
    let retry: i64 =
        sqlx::query_scalar("SELECT retry_at FROM _privacy_release WHERE kind='frames' AND id=?")
            .bind(&job.id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert!(retry > chrono::Utc::now().timestamp());
    assert!(!db
        .release_pending("frames", 256)
        .await
        .unwrap()
        .iter()
        .any(|j| j.id == job.id));
    db.execute_raw_sql_write(&format!("DELETE FROM frames WHERE id={}", job.id))
        .await
        .unwrap();
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM _privacy_work WHERE kind='frames' AND id=?")
            .bind(&job.id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    db.close().await;
}

struct CountingDetector {
    calls: Arc<std::sync::atomic::AtomicUsize>,
    fail: Arc<std::sync::atomic::AtomicBool>,
    delay: std::time::Duration,
}
#[async_trait::async_trait]
impl screenpipe_redact::Redactor for CountingDetector {
    fn name(&self) -> &str {
        "synthetic-counted"
    }
    fn version(&self) -> u32 {
        1
    }
    fn provides_model_detection(&self) -> bool {
        true
    }
    async fn redact_batch(
        &self,
        texts: &[String],
    ) -> Result<Vec<screenpipe_redact::RedactionOutput>, screenpipe_redact::RedactError> {
        self.calls
            .fetch_add(texts.len(), std::sync::atomic::Ordering::SeqCst);
        if !self.delay.is_zero() {
            tokio::time::sleep(self.delay).await;
        }
        if self.fail.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(screenpipe_redact::RedactError::Unexpected(
                "synthetic failure".into(),
            ));
        }
        Ok(texts
            .iter()
            .map(|text| screenpipe_redact::RedactionOutput {
                input: text.clone(),
                redacted: "[PRIVATE]".into(),
                spans: vec![],
            })
            .collect())
    }
}

#[tokio::test]
async fn small_slices_remain_fair_and_resumed_json_never_exposes_partial_results() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    let (_root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text,text_json) VALUES(1,'2020-01-01','private','[\"one\",\"two\",\"three\"]'); INSERT INTO memories(content,tags,source) VALUES('private','[]','')").await.unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let worker = screenpipe_redact::worker::Worker::new_with_writer(
        db.pool.clone(),
        db.coordinated_writer(),
        Arc::new(CountingDetector {
            calls: calls.clone(),
            fail: Arc::new(AtomicBool::new(false)),
            delay: std::time::Duration::from_millis(3),
        }),
        screenpipe_redact::worker::WorkerConfig {
            target_batch_duration: std::time::Duration::from_millis(1),
            resource_governor: None,
            ..Default::default()
        },
    )
    .with_frame_storage(db.clone());
    assert_eq!(worker.process_release_batch(1).await.unwrap(), 0);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(!db.release_ready("frames", "1").await.unwrap());
    // A different stream progresses while a large frame is partially processed.
    worker.process_release_batch(1).await.unwrap();
    assert!(db.release_ready("memory", "1").await.unwrap());
    worker.pause();
    let before = calls.load(Ordering::SeqCst);
    assert_eq!(worker.process_release_batch(1).await.unwrap(), 0);
    assert_eq!(calls.load(Ordering::SeqCst), before);
    worker.resume();
    // Discard obsolete partial work immediately, and process the new revision.
    db.execute_raw_sql_write("UPDATE frames SET full_text='replacement',text_json='[]' WHERE id=1")
        .await
        .unwrap();
    assert_eq!(worker.process_release_batch(1).await.unwrap(), 1);
    assert_eq!(calls.load(Ordering::SeqCst), before + 1);
    assert!(db.release_ready("frames", "1").await.unwrap());
    assert_eq!(worker.status().await.redacted_total, 2);
    db.close().await;
}

#[tokio::test]
async fn recent_arrivals_do_not_starve_old_work_and_recovery_clears_worker_error() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    let (_root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2020-01-01','old'),(2,'2020-01-02','recent')").await.unwrap();
    let fail = Arc::new(AtomicBool::new(true));
    let worker = screenpipe_redact::worker::Worker::new_with_writer(
        db.pool.clone(),
        db.coordinated_writer(),
        Arc::new(CountingDetector {
            calls: Arc::new(AtomicUsize::new(0)),
            fail: fail.clone(),
            delay: std::time::Duration::ZERO,
        }),
        Default::default(),
    )
    .with_frame_storage(db.clone());
    assert_eq!(worker.process_release_batch(1).await.unwrap(), 0);
    let failure = worker.status().await.last_error.unwrap();
    assert!(failure.contains("synthetic failure"));
    assert!(failure.contains("kind=frames"));
    assert!(failure.contains("retry scheduled"));
    fail.store(false, Ordering::SeqCst);
    db.execute_raw_sql_write(
        "INSERT INTO frames(id,timestamp,full_text) VALUES(3,'2020-01-03','newest')",
    )
    .await
    .unwrap();
    assert_eq!(worker.process_release_batch(1).await.unwrap(), 1);
    assert!(
        db.release_ready("frames", "1").await.unwrap(),
        "oldest must get a turn despite new captures"
    );
    let status = worker.status().await;
    assert_eq!(status.redacted_total, 1);
    assert!(status.last_redacted_at.is_some());
    assert!(status.last_error.is_none());
    db.close().await;
}

/// Manual local measurement; deliberately excluded from normal CI.
#[tokio::test]
#[ignore = "manual synthetic database performance benchmark"]
async fn privacy_queue_benchmark() {
    use std::time::Instant;
    fn p95(mut samples: Vec<f64>) -> f64 {
        samples.sort_by(f64::total_cmp);
        samples[(samples.len() * 95 / 100).min(samples.len() - 1)]
    }
    for history in [1000, 20000] {
        let (_root, db) = database().await;
        db.configure_release(&ReleasePolicy {
            identity: "bench".into(),
            text: false,
            images: false,
        })
        .await
        .unwrap();
        db.execute_raw_sql_write(&format!("WITH RECURSIVE ids(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM ids WHERE n<{history}) INSERT INTO frames(id,timestamp,full_text) SELECT n,'2020-01-01','synthetic benchmark text' FROM ids")).await.unwrap();
        db.configure_release(&ReleasePolicy {
            identity: "bench".into(),
            text: true,
            images: false,
        })
        .await
        .unwrap();
        // Synthetic certification is fixture setup, never detector evidence.
        db.execute_raw_sql_write(&format!("INSERT INTO _privacy_release(kind,id,policy) SELECT 'frames',CAST(id AS TEXT),'bench' FROM frames; INSERT INTO _privacy_discovery(kind,policy,after_id,complete) VALUES('frames','bench',{history},1)")).await.unwrap();
        let mut legacy = Vec::new();
        let mut indexed = Vec::new();
        for _ in 0..30 {
            let start = Instant::now();
            let rows: Vec<i64>=sqlx::query_scalar("SELECT s.id FROM frames s LEFT JOIN _privacy_release r ON r.kind='frames' AND r.id=CAST(s.id AS TEXT) WHERE r.policy IS NULL OR r.policy!='bench' ORDER BY s.id DESC LIMIT 16").fetch_all(&db.pool).await.unwrap();
            assert!(rows.is_empty());
            legacy.push(start.elapsed().as_secs_f64() * 1000.);
            let start = Instant::now();
            assert!(db.release_pending("frames", 16).await.unwrap().is_empty());
            indexed.push(start.elapsed().as_secs_f64() * 1000.);
        }
        let mut capture = Vec::new();
        for _ in 0..100 {
            let start = Instant::now();
            db.execute_raw_sql_write("INSERT INTO frames(timestamp,full_text) VALUES('2020-01-01','synthetic new capture')").await.unwrap();
            capture.push(start.elapsed().as_secs_f64() * 1000.);
        }
        println!("PRIVACY_BENCH history={history} idle_legacy_p95_ms={:.3} idle_indexed_p95_ms={:.3} protected_capture_p95_ms={:.3}",p95(legacy),p95(indexed),p95(capture));
        db.close().await;
    }
}

#[cfg(feature = "onnx-cpu")]
#[tokio::test]
#[ignore = "manual local real-detector benchmark; requires installed ONNX model"]
async fn privacy_real_detector_benchmark() {
    use screenpipe_redact::adapters::onnx::{OnnxConfig, OnnxRedactor};
    use std::time::{Duration, Instant};
    let (_root, db) = database().await;
    let start = Instant::now();
    let detector = Arc::new(OnnxRedactor::load(OnnxConfig::default()).unwrap());
    let load = start.elapsed();
    for n in 0..12 {
        db.execute_raw_sql_write(&format!("INSERT INTO frames(timestamp,full_text,text_json) VALUES('2020-01-01','Synthetic contact {n}: Jordan Lee, jordan{n}@example.com. Project update.','[\"Synthetic project planning\"]')")).await.unwrap();
    }
    let worker = screenpipe_redact::worker::Worker::new_with_writer(
        db.pool.clone(),
        db.coordinated_writer(),
        detector,
        Default::default(),
    )
    .with_frame_storage(db.clone());
    let monitor = worker.clone();
    let shutdown = Arc::new(tokio::sync::Notify::new());
    let start = Instant::now();
    let handle = worker.spawn_with_shutdown(shutdown.clone());
    let completed = tokio::time::timeout(Duration::from_secs(90), async {
        loop {
            if monitor.status().await.redacted_total >= 12 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await;
    shutdown.notify_one();
    handle.await.unwrap();
    completed.expect("background processing did not drain within benchmark deadline");
    println!(
        "PRIVACY_REAL_MODEL records=12 load_ms={} governed_elapsed_ms={} records_per_second={:.2}",
        load.as_millis(),
        start.elapsed().as_millis(),
        12. / start.elapsed().as_secs_f64()
    );
    assert_eq!(db.ready_changes(0, 100).await.unwrap().len(), 12);
    db.close().await;
}

#[tokio::test]
async fn deleting_and_reusing_an_id_never_accepts_old_text_or_image_work() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text,name) VALUES(1,'2020-01-01','old private','old.png')").await.unwrap();
    let text = db.release_pending("frames", 1).await.unwrap().remove(0);
    let image = db.release_pending("image", 1).await.unwrap().remove(0);
    db.execute_raw_sql_write("DELETE FROM frames WHERE id=1; INSERT INTO frames(id,timestamp,full_text,name) VALUES(1,'2020-01-02','replacement private','replacement.png')").await.unwrap();
    assert!(!db.release_job_current(&text).await.unwrap());
    assert!(!db.publish_release(&text, &text.values).await.unwrap());
    assert!(!db.publish_image_release(&image).await.unwrap());
    let current = db.release_pending("frames", 1).await.unwrap().remove(0);
    assert!(current.revision > text.revision);
    assert_eq!(
        current.values["full_text"].as_deref(),
        Some("replacement private")
    );
    db.close().await;
}

#[tokio::test]
async fn bounded_image_traversal_moves_past_future_dated_records() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write("WITH RECURSIVE ids(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM ids WHERE n<800) INSERT INTO frames(id,timestamp,name) SELECT n,CASE WHEN n=400 THEN '2020-01-01' ELSE '2099-01-01' END,'synthetic.png' FROM ids").await.unwrap();
    let mut found = false;
    for turn in 0..8 {
        let jobs = db
            .release_pending_ordered("image", 1, 60, turn % 2 == 0)
            .await
            .unwrap();
        if jobs.iter().any(|j| j.id == "400") {
            found = true;
            break;
        }
    }
    assert!(
        found,
        "future-dated images must not permanently hide mature work"
    );
    db.close().await;
}

#[tokio::test]
async fn pending_jobs_do_not_survive_source_changes_while_disabled() {
    for mutation in ["UPDATE frames SET full_text='replacement private',name='replacement.png' WHERE id=1", "DELETE FROM frames WHERE id=1; INSERT INTO frames(id,timestamp,full_text,name) VALUES(1,'2020-01-02','replacement private','replacement.png')"] {
        let (_root, db) = database().await;
        db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text,name) VALUES(1,'2020-01-01','old private','old.png')").await.unwrap();
        let text = db.release_pending("frames",1).await.unwrap().remove(0);
        let image = db.release_pending("image",1).await.unwrap().remove(0);
        let mut policy = db.release_policy().await.unwrap();
        policy.text=false; policy.images=false;
        db.configure_release(&policy).await.unwrap();
        assert!(!db.publish_release(&text, &text.values).await.unwrap());
        assert!(!db.publish_image_release(&image).await.unwrap());
        db.execute_raw_sql_write(mutation).await.unwrap();
        policy.text=true; policy.images=true;
        db.configure_release(&policy).await.unwrap();
        assert!(!db.release_job_current(&text).await.unwrap());
        assert!(!db.publish_release(&text,&text.values).await.unwrap());
        assert!(!db.publish_image_release(&image).await.unwrap());
        let current=db.release_pending("frames",1).await.unwrap().remove(0);
        assert!(current.revision>text.revision);
        assert_eq!(current.values["full_text"].as_deref(),Some("replacement private"));
        db.close().await;
    }
}

#[tokio::test]
async fn young_image_tail_does_not_hide_mature_backlog_or_report_retry() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write("WITH RECURSIVE ids(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM ids WHERE n<600) INSERT INTO frames(id,timestamp,name) SELECT n,CASE WHEN n<=300 THEN '2020-01-01' ELSE datetime('now') END,'synthetic.png' FROM ids").await.unwrap();
    let jobs = db
        .release_pending_ordered("image", 1, 60, false)
        .await
        .unwrap();
    assert!(
        !jobs.is_empty(),
        "recent young images must not hide ready old images"
    );
    assert!(jobs[0].id.parse::<i64>().unwrap() <= 300);
    // With only young work left, maturity is normal waiting, not a failure.
    db.execute_raw_sql_write("DELETE FROM frames WHERE id<=300")
        .await
        .unwrap();
    assert!(db
        .release_pending_ordered("image", 1, 60, true)
        .await
        .unwrap()
        .is_empty());
    let status = db.release_queue_status().await.unwrap();
    let images = status.surfaces.iter().find(|s| s.kind == "image").unwrap();
    assert!(images.pending > 0);
    assert_eq!(images.deferred, 0);
    db.close().await;
}

#[tokio::test]
async fn legacy_revision_zero_can_only_be_published_once() {
    let (_root, db) = database().await;
    let mut policy = db.release_policy().await.unwrap();
    policy.text = false;
    policy.images = false;
    db.configure_release(&policy).await.unwrap();
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text,name) VALUES(1,'2020-01-01','legacy','legacy.png')").await.unwrap();
    policy.text = true;
    policy.images = true;
    db.configure_release(&policy).await.unwrap();
    let text = db.release_pending("frames", 1).await.unwrap().remove(0);
    let image = db.release_pending("image", 1).await.unwrap().remove(0);
    assert_eq!(text.revision, 0);
    assert_eq!(image.revision, 0);
    assert!(db.publish_release(&text, &text.values).await.unwrap());
    assert!(!db.publish_release(&text, &text.values).await.unwrap());
    assert!(db.publish_image_release(&image).await.unwrap());
    assert!(!db.publish_image_release(&image).await.unwrap());
    db.close().await;
}

#[tokio::test]
async fn correcting_future_image_timestamp_restores_eligibility() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write(
        "INSERT INTO frames(id,timestamp,name) VALUES(1,'2099-01-01','synthetic.png')",
    )
    .await
    .unwrap();
    assert!(db
        .release_pending_aged("image", 1, 60)
        .await
        .unwrap()
        .is_empty());
    db.execute_raw_sql_write("UPDATE frames SET timestamp='2020-01-01' WHERE id=1")
        .await
        .unwrap();
    let jobs = db.release_pending_aged("image", 1, 60).await.unwrap();
    assert_eq!(
        jobs.len(),
        1,
        "corrected timestamp must not retain the 2099 deadline"
    );
    assert_eq!(jobs[0].id, "1");
    db.close().await;
}

#[tokio::test]
async fn publication_write_failure_rolls_back_receipt_and_source() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2020-01-01','SYNTHETIC_SECRET'); CREATE TRIGGER inject_publication_failure BEFORE INSERT ON _privacy_ready BEGIN SELECT RAISE(ABORT,'synthetic publication failure'); END;").await.unwrap();
    let job = db.release_pending("frames", 1).await.unwrap().remove(0);
    let mut clean = job.values.clone();
    clean.insert("full_text".into(), Some("[PRIVATE]".into()));
    assert!(db.publish_release(&job, &clean).await.is_err());
    assert!(!db.release_ready("frames", "1").await.unwrap());
    let raw: String = sqlx::query_scalar("SELECT full_text FROM frames WHERE id=1")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(raw, "SYNTHETIC_SECRET");
    db.execute_raw_sql_write("DROP TRIGGER inject_publication_failure; INSERT INTO frames(id,timestamp,full_text) VALUES(2,'2020-01-01','next capture')").await.unwrap();
    assert!(db.publish_release(&job, &clean).await.unwrap());
    assert_eq!(db.ready_changes(0, 10).await.unwrap().len(), 1);
    db.close().await;
}

#[tokio::test]
async fn randomized_revision_policy_delete_reinsert_sequences_never_release_stale_text() {
    for seed in [1u64, 7, 42, 20261014] {
        let (_root, db) = database().await;
        let protected = db.protected_reads().await.unwrap();
        let mut rng = seed;
        let mut jobs = Vec::new();
        let mut version = 0;
        for step in 0..500 {
            rng ^= rng << 13;
            rng ^= rng >> 7;
            rng ^= rng << 17;
            let id = 1 + rng % 24;
            match (rng >> 8) % 6 {
                0 | 1 => {
                    db.execute_raw_sql_write(&format!("INSERT INTO frames(id,timestamp,full_text) VALUES({id},'2020-01-01','SYNTHETIC_SECRET_{step}') ON CONFLICT(id) DO UPDATE SET full_text=excluded.full_text")).await.unwrap();
                }
                2 => {
                    db.execute_raw_sql_write(&format!("DELETE FROM frames WHERE id={id}"))
                        .await
                        .unwrap_or_else(|e| panic!("seed={seed} step={step} id={id}: {e}"));
                }
                3 => {
                    jobs.extend(db.release_pending("frames", 24).await.unwrap());
                }
                4 if !jobs.is_empty() => {
                    let job = jobs.swap_remove((rng as usize) % jobs.len());
                    let current = db.release_job_current(&job).await.unwrap();
                    let mut clean = job.values.clone();
                    clean.insert("full_text".into(), Some("[PRIVATE]".into()));
                    assert_eq!(
                        db.publish_release(&job, &clean).await.unwrap(),
                        current,
                        "seed={seed},step={step}"
                    );
                    if current {
                        assert!(
                            !db.publish_release(&job, &clean).await.unwrap(),
                            "duplicate completion"
                        );
                    }
                }
                5 => {
                    version += 1;
                    db.configure_release(&ReleasePolicy {
                        identity: format!("random:{version}"),
                        text: true,
                        images: true,
                    })
                    .await
                    .unwrap();
                }
                _ => {}
            }
            let leaked: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM frames WHERE full_text LIKE '%SYNTHETIC_SECRET%'",
            )
            .fetch_one(&protected.pool)
            .await
            .unwrap();
            assert_eq!(leaked, 0, "seed={seed},step={step}");
        }
        protected.close().await;
        db.close().await;
    }
}

#[tokio::test]
async fn partial_multifield_work_survives_close_reopen_sqlite_and_hybrid() {
    use std::sync::atomic::{AtomicBool, AtomicUsize};
    for hybrid in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let open = || async {
            Arc::new(if hybrid {
                DatabaseManager::new_hybrid(root.path(), Default::default(), Default::default())
                    .await
                    .unwrap()
            } else {
                DatabaseManager::new(
                    root.path().join("db.sqlite").to_str().unwrap(),
                    Default::default(),
                )
                .await
                .unwrap()
            })
        };
        let db = open().await;
        db.configure_release(&ReleasePolicy {
            identity: "restart:v1".into(),
            text: true,
            images: false,
        })
        .await
        .unwrap();
        db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text,text_json) VALUES(1,'2020-01-01','SYNTHETIC_SECRET','[\"SYNTHETIC_SECRET\",\"another private field\"]')").await.unwrap();
        let detector = Arc::new(CountingDetector {
            calls: Arc::new(AtomicUsize::new(0)),
            fail: Arc::new(AtomicBool::new(false)),
            delay: std::time::Duration::from_millis(3),
        });
        let worker = screenpipe_redact::worker::Worker::new_with_writer(
            db.pool.clone(),
            db.coordinated_writer(),
            detector.clone(),
            screenpipe_redact::worker::WorkerConfig {
                target_batch_duration: std::time::Duration::from_millis(1),
                resource_governor: None,
                ..Default::default()
            },
        )
        .with_frame_storage(db.clone());
        assert_eq!(worker.process_release_batch(1).await.unwrap(), 0);
        assert!(!db.release_ready("frames", "1").await.unwrap());
        db.execute_raw_sql_write(
            "INSERT INTO frames(id,timestamp,full_text) VALUES(2,'2020-01-01','SYNTHETIC_SECRET')",
        )
        .await
        .unwrap();
        drop(worker);
        db.close().await;
        drop(db);
        // Normal open discovers the persisted hybrid descriptor; new_hybrid
        // is only the initial opt-in for an empty root.
        let db = Arc::new(
            DatabaseManager::new(
                root.path().join("db.sqlite").to_str().unwrap(),
                Default::default(),
            )
            .await
            .unwrap(),
        );
        let protected = db.protected_reads().await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM frames")
                .fetch_one(&protected.pool)
                .await
                .unwrap(),
            0
        );
        let worker = screenpipe_redact::worker::Worker::new_with_writer(
            db.pool.clone(),
            db.coordinated_writer(),
            detector,
            screenpipe_redact::worker::WorkerConfig {
                resource_governor: None,
                ..Default::default()
            },
        )
        .with_frame_storage(db.clone());
        for _ in 0..20 {
            worker.process_release_batch(8).await.unwrap();
        }
        assert_eq!(db.ready_changes(0, 10).await.unwrap().len(), 2);
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM frames WHERE full_text LIKE '%SYNTHETIC_SECRET%'"
            )
            .fetch_one(&protected.pool)
            .await
            .unwrap(),
            0
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM frames")
                .fetch_one(&protected.pool)
                .await
                .unwrap(),
            2
        );
        protected.close().await;
        db.close().await;
    }
}

#[tokio::test]
async fn activity_labels_keep_structure_and_revoke_on_edit_policy_and_restart() {
    let (root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2026-10-14T10:00:00Z','pending'); INSERT INTO activity_tasks(id,task_key,kind,title,confidence,producer,user_locked) VALUES(1,'task','task','SYNTHETIC_SECRET',1,'test',1); INSERT INTO activity_intervals(id,interval_key,task_id,start_at,end_at,state,confidence,producer) VALUES(1,'interval',1,'2026-10-14T10:00:00Z','2026-10-14T10:05:00Z','final',1,'test'); INSERT INTO activity_actions(id,action_key,interval_id,occurred_at,action_type,summary,confidence,source_type,source_id) VALUES(1,'action',1,'2026-10-14T10:00:00Z','view','SYNTHETIC_SECRET',1,'frame',1)").await.unwrap();
    let protected = db.protected_reads().await.unwrap();
    let start = "2026-10-14T09:00:00Z".parse().unwrap();
    let end = "2026-10-14T11:00:00Z".parse().unwrap();
    assert!(!protected.activity_sources_ready(start, end).await.unwrap());
    let pending = protected
        .list_activity_ledger(start, end, true, true)
        .await
        .unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].id, 1);
    assert!(pending[0].title.contains("privacy processing"));
    assert!(pending[0].actions[0].summary.contains("privacy processing"));
    for kind in ["activity_tasks", "activity_actions", "frames"] {
        let job = db.release_pending(kind, 1).await.unwrap().remove(0);
        let values = job
            .values
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    v.as_ref()
                        .map(|v| v.replace("SYNTHETIC_SECRET", "[PRIVATE]")),
                )
            })
            .collect();
        assert!(db.publish_release(&job, &values).await.unwrap());
    }
    assert!(protected.activity_sources_ready(start, end).await.unwrap());
    let ready = protected
        .list_activity_ledger(start, end, true, true)
        .await
        .unwrap();
    assert_eq!(ready[0].id, pending[0].id);
    assert_eq!(ready[0].start_at, pending[0].start_at);
    assert_eq!(ready[0].title, "[PRIVATE]");
    assert_eq!(ready[0].actions[0].summary, "[PRIVATE]");
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT user_locked FROM activity_tasks WHERE id=1")
            .fetch_one(&db.pool)
            .await
            .unwrap(),
        1
    );
    db.execute_raw_sql_write("UPDATE activity_tasks SET title='SYNTHETIC_SECRET_EDIT' WHERE id=1")
        .await
        .unwrap();
    assert!(protected
        .list_activity_ledger(start, end, false, false)
        .await
        .unwrap()[0]
        .title
        .contains("privacy processing"));
    db.configure_release(&ReleasePolicy {
        identity: "v2".into(),
        text: true,
        images: true,
    })
    .await
    .unwrap();
    assert!(protected
        .list_activity_ledger(start, end, true, false)
        .await
        .unwrap()[0]
        .actions[0]
        .summary
        .contains("privacy processing"));
    db.close().await;
    drop(protected);
    drop(db);
    let reopened = Arc::new(
        DatabaseManager::new(
            root.path().join("db.sqlite").to_str().unwrap(),
            Default::default(),
        )
        .await
        .unwrap(),
    );
    let protected = reopened.protected_reads().await.unwrap();
    assert!(protected
        .list_activity_ledger(start, end, false, false)
        .await
        .unwrap()[0]
        .title
        .contains("privacy processing"));
    assert_eq!(
        reopened
            .release_pending("activity_tasks", 1)
            .await
            .unwrap()
            .len(),
        1
    );
    reopened.close().await;
}

#[tokio::test]
async fn bulk_release_can_seal_without_revoking_and_edits_still_revoke() {
    let root = tempfile::tempdir().unwrap();
    let db = Arc::new(
        DatabaseManager::new_hybrid(root.path(), Default::default(), Default::default())
            .await
            .unwrap(),
    );
    db.configure_release(&ReleasePolicy {
        identity: "bulk-v1".into(),
        text: true,
        images: false,
    })
    .await
    .unwrap();
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text) VALUES(1,'2026-10-14T10:00:00Z','safe'); INSERT INTO audio_chunks(id,file_path) VALUES(1,'test.wav'); INSERT INTO audio_transcriptions(id,audio_chunk_id,offset_index,timestamp,transcription,device) VALUES(1,1,0,'2026-10-14T10:00:00Z','safe audio','test'); INSERT INTO ui_events(id,timestamp,event_type,text_content) VALUES(1,'2026-10-14T10:00:00Z','text','safe input'); INSERT INTO elements(id,frame_id,source,role,text) VALUES(1,1,'accessibility','AXText','safe element')").await.unwrap();
    for kind in ["frames", "audio", "input", "elements"] {
        let job = db.release_pending(kind, 1).await.unwrap().remove(0);
        assert!(db.publish_release(&job, &job.values).await.unwrap());
    }
    for table in ["audio_transcriptions", "ui_events", "elements"] {
        assert!(sqlx::query_scalar::<_, bool>(sqlx::AssertSqlSafe(format!(
            "SELECT redacted_at IS NOT NULL FROM {table} WHERE id=1"
        )))
        .fetch_one(&db.pool)
        .await
        .unwrap());
    }
    let before = db.release_revocation().await.unwrap();
    let mut sealed = 0;
    loop {
        let count = db.seal_payloads().await.unwrap();
        if count == 0 {
            break;
        }
        sealed += count;
    }
    assert_eq!(sealed, 4);
    assert_eq!(db.release_revocation().await.unwrap(), before);
    for kind in ["frames", "audio", "input", "elements"] {
        assert!(db.release_ready(kind, "1").await.unwrap(), "{kind}");
        assert!(
            db.release_pending(kind, 1).await.unwrap().is_empty(),
            "{kind}"
        );
    }
    db.execute_raw_sql_write("UPDATE audio_transcriptions SET transcription='new private audio' WHERE id=1; UPDATE ui_events SET text_content='new private input' WHERE id=1; UPDATE elements SET text='new private element' WHERE id=1").await.unwrap();
    for kind in ["audio", "input", "elements"] {
        assert!(!db.release_ready(kind, "1").await.unwrap(), "{kind}");
        assert_eq!(
            db.release_pending(kind, 1).await.unwrap().len(),
            1,
            "{kind}"
        );
    }
    let obsolete = db.release_pending("elements", 1).await.unwrap().remove(0);
    db.execute_raw_sql_write("DELETE FROM elements WHERE id=1")
        .await
        .unwrap();
    assert!(!db.release_ready("elements", "1").await.unwrap());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM _privacy_work WHERE kind='elements'")
            .fetch_one(&db.pool)
            .await
            .unwrap(),
        0
    );
    db.execute_raw_sql_write("INSERT INTO elements(id,frame_id,source,role,text) VALUES(1,1,'accessibility','AXText','replacement')").await.unwrap();
    assert!(!db
        .publish_release(&obsolete, &obsolete.values)
        .await
        .unwrap());
    db.close().await;
}

#[tokio::test]
async fn unchanged_configuration_keeps_receipts_but_an_older_contract_is_revoked() {
    let (_root, db) = database().await;
    db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text,document_path) VALUES(1,'2026-10-14','safe','/private/document')").await.unwrap();
    let job = db.release_pending("frames", 1).await.unwrap().remove(0);
    assert!(job.values.contains_key("document_path"));
    assert!(db.publish_release(&job, &job.values).await.unwrap());
    let policy = db.release_policy().await.unwrap();
    db.configure_release(&policy).await.unwrap();
    assert!(db.release_ready("frames", "1").await.unwrap());
    // Simulate a receipt produced by the earlier field contract, which did
    // not watch document paths. Startup must not reuse it for the wider gate.
    db.execute_raw_sql_write("DROP TRIGGER privacy_frames_UPDATE; CREATE TRIGGER privacy_frames_UPDATE AFTER UPDATE OF full_text ON frames BEGIN SELECT 1; END;").await.unwrap();
    db.configure_release(&policy).await.unwrap();
    assert!(!db.release_ready("frames", "1").await.unwrap());
    assert_eq!(db.release_pending("frames", 1).await.unwrap().len(), 1);
    db.close().await;
}
