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
