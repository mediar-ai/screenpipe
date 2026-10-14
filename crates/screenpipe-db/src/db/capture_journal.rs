// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use super::DatabaseManager;
use crate::write_queue::{WriteOp, WriteQueue, WriteResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{pool::PoolConnection, Sqlite};
use std::{
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::sync::{broadcast, Notify};
use tokio_util::sync::CancellationToken;

/// A locally durable capture is not necessarily indexed yet.
#[derive(Clone, Debug)]
pub struct FrameAdmission {
    pub frame_id: Option<i64>,
    pub capture_id: String,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct SnapshotFramePayload {
    pub device_name: String,
    pub timestamp: DateTime<Utc>,
    pub snapshot_path: String,
    pub app_name: Option<String>,
    pub window_name: Option<String>,
    pub browser_url: Option<String>,
    pub document_path: Option<String>,
    pub focused: bool,
    pub capture_trigger: Option<String>,
    pub accessibility_text: Option<String>,
    pub text_source: Option<String>,
    pub accessibility_tree_json: Option<String>,
    pub content_hash: Option<i64>,
    pub simhash: Option<i64>,
    pub ocr_text_json: Option<String>,
    pub full_text: Option<String>,
    pub elements_ref_frame_id: Option<i64>,
}

#[derive(Serialize, Deserialize)]
struct PendingCapture {
    source_id: String,
    capture_id: String,
    payload: SnapshotFramePayload,
}

pub(crate) const DELETE_CAPTURE: i64 = 1;
pub(crate) const EVICT_CAPTURE_MEDIA: i64 = 2;
pub(crate) const STRIP_CAPTURE_DETAILS: i64 = 4;

pub(crate) struct CaptureJournal {
    source_id: String,
    root: PathBuf,
    wake: Notify,
    completed: broadcast::Sender<FrameAdmission>,
    pending: AtomicU64,
    last_index_ts: AtomicU64,
    filesystem: Arc<Mutex<()>>,
}

fn io_error(error: impl std::fmt::Display) -> sqlx::Error {
    sqlx::Error::Protocol(format!("capture journal: {error}"))
}

fn sync_directory(path: &Path) -> Result<(), sqlx::Error> {
    #[cfg(unix)]
    screenpipe_fs::sync_all(&std::fs::File::open(path)?)?;
    Ok(())
}

fn persist(path: &Path, capture: &PendingCapture) -> Result<(), sqlx::Error> {
    let temporary = path.with_extension("tmp");
    let file = std::fs::File::create(&temporary)?;
    let mut writer = BufWriter::new(file);
    serde_json::to_writer(&mut writer, capture).map_err(io_error)?;
    writer.flush()?;
    screenpipe_fs::sync_all(writer.get_ref())?;
    drop(writer);
    std::fs::rename(temporary, path)?;
    sync_directory(path.parent().expect("journal file has a parent"))
}

impl CaptureJournal {
    pub(crate) fn new(root: PathBuf, source_id: String) -> Result<Arc<Self>, sqlx::Error> {
        let data = root.join("data");
        std::fs::create_dir_all(&data)?;
        let journals = data.join("capture-journal");
        std::fs::create_dir_all(&journals)?;
        let directory = journals.join(&source_id);
        std::fs::create_dir_all(&directory)?;
        sync_directory(&directory)?;
        sync_directory(&journals)?;
        sync_directory(&data)?;
        sync_directory(&root)?;
        let pending = std::fs::read_dir(&directory)?.try_fold(0_u64, |count, entry| {
            let path = entry?.path();
            Ok::<_, std::io::Error>(
                count + u64::from(path.extension().and_then(|s| s.to_str()) == Some("json")),
            )
        })?;
        let (completed, _) = broadcast::channel(128);
        Ok(Arc::new(Self {
            source_id,
            root: directory,
            wake: Notify::new(),
            completed,
            pending: AtomicU64::new(pending),
            last_index_ts: AtomicU64::new(0),
            filesystem: Arc::new(Mutex::new(())),
        }))
    }

    pub(crate) async fn admit(
        &self,
        payload: SnapshotFramePayload,
    ) -> Result<FrameAdmission, sqlx::Error> {
        let capture_id = uuid::Uuid::new_v4().to_string();
        let capture = PendingCapture {
            source_id: self.source_id.clone(),
            capture_id: capture_id.clone(),
            payload,
        };
        let path = self.root.join(format!("{capture_id}.json"));
        let mut completed = self.completed.subscribe();
        self.pending.fetch_add(1, Ordering::Relaxed);
        let persisted = tokio::task::spawn_blocking(move || persist(&path, &capture))
            .await
            .map_err(io_error)
            .and_then(|result| result);
        if let Err(error) = persisted {
            self.pending.fetch_sub(1, Ordering::Relaxed);
            return Err(error);
        }
        self.wake.notify_one();
        // This waits only for an actual commit notification, never for writer
        // admission. There are no detached per-capture SQLite waiter tasks.
        let indexed = tokio::time::timeout(Duration::from_millis(250), async {
            while let Ok(admission) = completed.recv().await {
                if admission.capture_id == capture_id {
                    return admission.frame_id;
                }
            }
            None
        })
        .await
        .unwrap_or(None);
        Ok(FrameAdmission {
            frame_id: indexed,
            capture_id,
        })
    }

    pub(crate) fn start(self: &Arc<Self>, queue: WriteQueue, shutdown: CancellationToken) {
        let journal = Arc::clone(self);
        tokio::spawn(async move {
            loop {
                let pass = journal.replay_pass(&queue);
                tokio::select! {
                    biased;
                    _ = shutdown.cancelled() => return,
                    result = pass => {
                        if let Err(error) = result { tracing::warn!("capture replay deferred: {error}"); }
                    }
                }
                tokio::select! {
                    biased;
                    _ = shutdown.cancelled() => return,
                    _ = journal.wake.notified() => {},
                    _ = tokio::time::sleep(Duration::from_secs(1)) => {},
                }
            }
        });
    }

    async fn replay_pass(self: &Arc<Self>, queue: &WriteQueue) -> Result<(), sqlx::Error> {
        // ReadDir is streamed; at most one owned capture is waiting on SQLite.
        let mut entries = tokio::fs::read_dir(&self.root).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let bytes = match tokio::fs::read(&path).await {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.into()),
            };
            let capture: PendingCapture = serde_json::from_slice(&bytes).map_err(io_error)?;
            if capture.source_id != self.source_id {
                return Err(io_error("capture belongs to another database"));
            }
            let snapshot = capture.payload.snapshot_path.clone();
            let result = queue
                .submit(WriteOp::AdmitSnapshotFrame {
                    capture_id: capture.capture_id.clone(),
                    payload: capture.payload,
                })
                .await?;
            let WriteResult::FrameAdmission {
                frame_id,
                delete_snapshot,
                indexed_now,
            } = result
            else {
                unreachable!()
            };
            if indexed_now {
                self.last_index_ts
                    .store(Utc::now().timestamp() as u64, Ordering::Relaxed);
            }
            let _ = self.completed.send(FrameAdmission {
                frame_id,
                capture_id: capture.capture_id,
            });
            let journal = Arc::clone(self);
            tokio::task::spawn_blocking(move || {
                let _guard = journal.filesystem.lock().map_err(io_error)?;
                if delete_snapshot && !snapshot.is_empty() {
                    remove_if_present(Path::new(&snapshot))?;
                }
                if remove_if_present(&path)? {
                    journal.pending.fetch_sub(1, Ordering::Relaxed);
                }
                sync_directory(&journal.root)
            })
            .await
            .map_err(io_error)??;
        }
        Ok(())
    }

    async fn project_range(
        self: &Arc<Self>,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        projection: i64,
    ) -> Result<(), sqlx::Error> {
        let journal = Arc::clone(self);
        let root = self.root.clone();
        tokio::task::spawn_blocking(move || {
            let _guard = journal.filesystem.lock().map_err(io_error)?;
            for entry in std::fs::read_dir(&root)? {
                let path = entry?.path();
                if path.extension().and_then(|s| s.to_str()) != Some("json") {
                    continue;
                }
                let bytes = match std::fs::read(&path) {
                    Ok(bytes) => bytes,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                    Err(error) => return Err(error.into()),
                };
                let mut capture: PendingCapture =
                    serde_json::from_slice(&bytes).map_err(io_error)?;
                if capture.payload.timestamp < start || capture.payload.timestamp > end {
                    continue;
                }
                if projection & (DELETE_CAPTURE | EVICT_CAPTURE_MEDIA) != 0
                    && !capture.payload.snapshot_path.is_empty()
                {
                    remove_if_present(Path::new(&capture.payload.snapshot_path))?;
                    capture.payload.snapshot_path.clear();
                }
                if projection & DELETE_CAPTURE != 0 {
                    if remove_if_present(&path)? {
                        journal.pending.fetch_sub(1, Ordering::Relaxed);
                    }
                } else {
                    if projection & STRIP_CAPTURE_DETAILS != 0 {
                        capture.payload.accessibility_tree_json = None;
                        capture.payload.ocr_text_json = None;
                        capture.payload.elements_ref_frame_id = None;
                    }
                    // The worker may have acknowledged this file while pruning.
                    // Its receipt makes a re-created entry an idempotent no-op.
                    persist(&path, &capture)?;
                }
            }
            sync_directory(&root)
        })
        .await
        .map_err(io_error)?
    }
}

pub(crate) async fn insert_snapshot_payload(
    conn: &mut PoolConnection<Sqlite>,
    payload: &SnapshotFramePayload,
    projection: i64,
) -> Result<i64, sqlx::Error> {
    let snapshot = (!payload.snapshot_path.is_empty() && projection & EVICT_CAPTURE_MEDIA == 0)
        .then_some(payload.snapshot_path.as_str());
    let details = projection & STRIP_CAPTURE_DETAILS == 0;
    let mut reference = payload.elements_ref_frame_id.filter(|_| details);
    if let Some(id) = reference {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM frames WHERE id=?)")
            .bind(id)
            .fetch_one(&mut **conn)
            .await?;
        if !exists {
            reference = None;
        }
    }
    let id = sqlx::query(
        r#"INSERT INTO frames (
        video_chunk_id, offset_index, timestamp, name, browser_url, app_name,
        window_name, focused, device_name, snapshot_path, capture_trigger,
        accessibility_text, text_source, accessibility_tree_json, content_hash,
        simhash, full_text, elements_ref_frame_id, document_path, text_json
    ) VALUES (NULL,0,?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)"#,
    )
    .bind(payload.timestamp)
    .bind(snapshot)
    .bind(payload.browser_url.as_deref())
    .bind(payload.app_name.as_deref())
    .bind(payload.window_name.as_deref())
    .bind(payload.focused)
    .bind(&payload.device_name)
    .bind(snapshot)
    .bind(payload.capture_trigger.as_deref())
    .bind(payload.accessibility_text.as_deref())
    .bind(payload.text_source.as_deref())
    .bind(
        payload
            .accessibility_tree_json
            .as_deref()
            .filter(|_| details),
    )
    .bind(payload.content_hash)
    .bind(payload.simhash)
    .bind(payload.full_text.as_deref())
    .bind(reference)
    .bind(payload.document_path.as_deref())
    .bind(payload.ocr_text_json.as_deref().filter(|_| details))
    .execute(&mut **conn)
    .await?
    .last_insert_rowid();
    Ok(id)
}

pub(crate) async fn execute_admission(
    conn: &mut PoolConnection<Sqlite>,
    capture_id: &str,
    payload: &SnapshotFramePayload,
) -> Result<WriteResult, sqlx::Error> {
    let receipt: Option<Option<i64>> =
        sqlx::query_scalar("SELECT frame_id FROM _capture_journal_receipts WHERE capture_id=?")
            .bind(capture_id)
            .fetch_optional(&mut **conn)
            .await?;
    if let Some(frame_id) = receipt {
        let existing: Option<(i64, Option<String>)> = match frame_id {
            Some(id) => {
                sqlx::query_as("SELECT id,snapshot_path FROM frames WHERE id=?")
                    .bind(id)
                    .fetch_optional(&mut **conn)
                    .await?
            }
            None => None,
        };
        return Ok(WriteResult::FrameAdmission {
            frame_id: existing.as_ref().map(|row| row.0),
            delete_snapshot: existing.as_ref().is_none_or(|row| row.1.is_none()),
            indexed_now: false,
        });
    }
    let (deleted, media, lean): (i64,i64,i64) = sqlx::query_as("SELECT COALESCE(MAX(projection & 1),0),COALESCE(MAX(projection & 2),0),COALESCE(MAX(projection & 4),0) FROM _capture_journal_exclusions WHERE started_at<=?1 AND ended_at>=?1")
        .bind(payload.timestamp.timestamp_micros()).fetch_one(&mut **conn).await?;
    let projection = deleted | media | lean;
    // Other writes in the coalesced transaction may continue after a row error.
    // Keep frame + supplemental elements + receipt atomic even in that case.
    sqlx::query("SAVEPOINT capture_admission")
        .execute(&mut **conn)
        .await?;
    let result = async {
        let frame_id = if deleted != 0 {
            None
        } else {
            let id = insert_snapshot_payload(conn, payload, projection).await?;
            if lean == 0 {
                let reference: Option<i64> =
                    sqlx::query_scalar("SELECT elements_ref_frame_id FROM frames WHERE id=?")
                        .bind(id)
                        .fetch_one(&mut **conn)
                        .await?;
                if reference.is_none() {
                    if let Some(json) = payload.ocr_text_json.as_deref().filter(|s| !s.is_empty()) {
                        DatabaseManager::insert_ocr_elements(conn, id, json).await?;
                    }
                    if let Some(json) = payload
                        .accessibility_tree_json
                        .as_deref()
                        .filter(|s| !s.is_empty())
                    {
                        DatabaseManager::insert_accessibility_elements(conn, id, json).await?;
                    }
                }
            }
            Some(id)
        };
        sqlx::query("INSERT INTO _capture_journal_receipts(capture_id,frame_id) VALUES(?,?)")
            .bind(capture_id)
            .bind(frame_id)
            .execute(&mut **conn)
            .await?;
        Ok(WriteResult::FrameAdmission {
            frame_id,
            delete_snapshot: deleted != 0 || media != 0,
            indexed_now: frame_id.is_some(),
        })
    }
    .await;
    match result {
        Ok(value) => {
            sqlx::query("RELEASE capture_admission")
                .execute(&mut **conn)
                .await?;
            Ok(value)
        }
        Err(error) => {
            let rollback = sqlx::query("ROLLBACK TO capture_admission")
                .execute(&mut **conn)
                .await;
            let release = sqlx::query("RELEASE capture_admission")
                .execute(&mut **conn)
                .await;
            // SQLite can discard its transaction on I/O failure. Preserve that
            // hard-fault code rather than replacing it with "no such savepoint".
            if crate::sqlite_error::is_sqlite_hard_fault(&error) {
                return Err(error);
            }
            rollback?;
            release?;
            Err(error)
        }
    }
}

fn remove_if_present(path: &Path) -> Result<bool, sqlx::Error> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

impl DatabaseManager {
    pub fn pending_capture_count(&self) -> u64 {
        self.capture_journal
            .as_ref()
            .map_or(0, |journal| journal.pending.load(Ordering::Relaxed))
    }

    pub fn last_capture_index_ts(&self) -> u64 {
        self.capture_journal
            .as_ref()
            .map_or(0, |journal| journal.last_index_ts.load(Ordering::Relaxed))
    }

    pub async fn capture_frame_id(&self, capture_id: &str) -> Result<Option<i64>, sqlx::Error> {
        sqlx::query_scalar("SELECT f.id FROM _capture_journal_receipts r JOIN frames f ON f.id=r.frame_id WHERE r.capture_id=?")
            .bind(capture_id).fetch_optional(&self.pool).await
    }

    pub(crate) async fn exclude_pending_captures_in_tx(
        conn: &mut PoolConnection<Sqlite>,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        projection: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT OR IGNORE INTO _capture_journal_exclusions(started_at,ended_at,projection) VALUES(?,?,?)")
            .bind(start.timestamp_micros()).bind(end.timestamp_micros()).bind(projection)
            .execute(&mut **conn).await?;
        Ok(())
    }

    pub(crate) async fn project_pending_captures(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        projection: i64,
    ) -> Result<(), sqlx::Error> {
        if let Some(journal) = &self.capture_journal {
            journal.project_range(start, end, projection).await?;
        }
        Ok(())
    }

    /// Apply retention to journal-only captures independently of the indexed
    /// oldest timestamp / cleanup watermark. mode matches retention All/Media/Lean.
    pub async fn retain_pending_screen_captures(
        &self,
        cutoff: DateTime<Utc>,
        mode: &str,
    ) -> Result<(), sqlx::Error> {
        let projection = match mode {
            "all" => DELETE_CAPTURE,
            "media" => EVICT_CAPTURE_MEDIA,
            "lean" => EVICT_CAPTURE_MEDIA | STRIP_CAPTURE_DETAILS,
            _ => return Err(io_error("unknown screen retention mode")),
        };
        let start = DateTime::<Utc>::MIN_UTC;
        let mut tx = self.begin_immediate_with_retry().await?;
        Self::exclude_pending_captures_in_tx(tx.conn(), start, cutoff, projection).await?;
        tx.commit().await?;
        self.project_pending_captures(start, cutoff, projection)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration as ChronoDuration;

    const TREE: &str =
        r#"[{"role":"AXStaticText","text":"safe capture","depth":0,"on_screen":true}]"#;

    async fn open(root: &Path) -> DatabaseManager {
        DatabaseManager::new(root.join("db.sqlite").to_str().unwrap(), Default::default())
            .await
            .unwrap()
    }

    fn screenshot(root: &Path) -> String {
        let path = root.join(format!("{}.jpg", uuid::Uuid::new_v4()));
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(b"synthetic screenshot").unwrap();
        screenpipe_fs::sync_all(&file).unwrap();
        path.to_string_lossy().into_owned()
    }

    async fn admit(
        db: &DatabaseManager,
        timestamp: DateTime<Utc>,
        snapshot: &str,
    ) -> FrameAdmission {
        db.admit_snapshot_frame_with_ocr(
            "test",
            timestamp,
            snapshot,
            Some("test app"),
            Some("safe title"),
            None,
            None,
            true,
            Some("test"),
            Some("safe capture"),
            Some("accessibility"),
            Some(TREE),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap()
    }

    async fn indexed(db: &DatabaseManager, capture_id: &str) -> i64 {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Some(id) = db.capture_frame_id(capture_id).await.unwrap() {
                    return id;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("pending capture indexed")
    }

    async fn drained(db: &DatabaseManager) {
        tokio::time::timeout(Duration::from_secs(5), async {
            while db.pending_capture_count() != 0 {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("journal drained");
    }

    fn manifest(db: &DatabaseManager, capture_id: &str) -> (PathBuf, Vec<u8>) {
        let path = db
            .capture_journal
            .as_ref()
            .unwrap()
            .root
            .join(format!("{capture_id}.json"));
        let bytes = std::fs::read(&path).unwrap();
        (path, bytes)
    }

    async fn reject_frames(db: &DatabaseManager) {
        db.execute_raw_sql_write("CREATE TRIGGER reject_capture BEFORE INSERT ON frames BEGIN SELECT RAISE(ABORT,'injected writer failure'); END").await.unwrap();
    }

    #[tokio::test]
    async fn hybrid_pending_replay_uses_data_root_and_preserves_supplemental_tree() {
        let root = tempfile::tempdir().unwrap();
        let db = DatabaseManager::new_hybrid(root.path(), Default::default(), Default::default())
            .await
            .unwrap();
        assert!(db
            .capture_journal
            .as_ref()
            .unwrap()
            .root
            .starts_with(root.path().canonicalize().unwrap().join("data")));
        assert_eq!(db.initialized_upload_source_id(), None);
        let snapshot = screenshot(root.path());
        let guard = db.write_semaphore.clone().acquire_owned().await.unwrap();
        let admission = admit(&db, Utc::now(), &snapshot).await;
        assert_eq!(admission.frame_id, None);
        db.close().await;
        drop(guard);
        let reopened = open(root.path()).await;
        let id = indexed(&reopened, &admission.capture_id).await;
        let payload = reopened
            .frame_payloads(&[id], crate::storage::Projection::All)
            .await
            .unwrap()
            .remove(&id)
            .unwrap();
        assert_eq!(payload.full_text.as_deref(), Some("safe capture"));
        assert_eq!(payload.accessibility_tree_json.as_deref(), Some(TREE));
        let elements: i64 = sqlx::query_scalar("SELECT count(*) FROM elements WHERE frame_id=?")
            .bind(id)
            .fetch_one(&reopened.pool)
            .await
            .unwrap();
        assert_eq!(elements, 1);
        drained(&reopened).await;
        reopened.close().await;
    }

    #[tokio::test]
    async fn healthy_admission_reports_only_committed_metadata_and_elements() {
        let root = tempfile::tempdir().unwrap();
        let db = open(root.path()).await;
        let admission = admit(&db, Utc::now(), &screenshot(root.path())).await;
        let id = indexed(&db, &admission.capture_id).await;
        if let Some(direct_id) = admission.frame_id {
            assert_eq!(direct_id, id);
        }
        let elements: i64 = sqlx::query_scalar("SELECT count(*) FROM elements WHERE frame_id=?")
            .bind(id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(elements, 1);
        assert!(db.last_capture_index_ts() > 0);
        drained(&db).await;
        db.close().await;
    }

    #[tokio::test]
    async fn blocked_writer_returns_durable_pending_then_restart_replays_once() {
        let root = tempfile::tempdir().unwrap();
        let db = open(root.path()).await;
        let guard = db.write_semaphore.clone().acquire_owned().await.unwrap();
        let snapshot = screenshot(root.path());
        let started = std::time::Instant::now();
        let admission = admit(&db, Utc::now(), &snapshot).await;
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "must not await the SQLite writer"
        );
        assert_eq!(admission.frame_id, None);
        assert_eq!(db.pending_capture_count(), 1);
        assert!(
            std::fs::metadata(manifest(&db, &admission.capture_id).0)
                .unwrap()
                .len()
                > 0
        );
        db.close().await;
        drop(guard);
        let reopened = open(root.path()).await;
        indexed(&reopened, &admission.capture_id).await;
        drained(&reopened).await;
        let frames: i64 = sqlx::query_scalar("SELECT count(*) FROM frames")
            .fetch_one(&reopened.pool)
            .await
            .unwrap();
        assert_eq!(frames, 1);
        assert!(Path::new(&snapshot).exists());
        reopened.close().await;
    }

    #[tokio::test]
    async fn supplemental_failure_retains_complete_capture_until_successful_replay() {
        let root = tempfile::tempdir().unwrap();
        let db = open(root.path()).await;
        db.execute_raw_sql_write("CREATE TRIGGER reject_elements BEFORE INSERT ON elements BEGIN SELECT RAISE(ABORT,'injected element failure'); END").await.unwrap();
        let admission = admit(&db, Utc::now(), &screenshot(root.path())).await;
        assert_eq!(admission.frame_id, None);
        let frames: i64 = sqlx::query_scalar("SELECT count(*) FROM frames")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(
            frames, 0,
            "failed supplemental write must roll back its frame/receipt"
        );
        manifest(&db, &admission.capture_id);
        db.close().await;
        let reopened = open(root.path()).await;
        reopened
            .execute_raw_sql_write("DROP TRIGGER reject_elements")
            .await
            .unwrap();
        let id = indexed(&reopened, &admission.capture_id).await;
        let elements: i64 = sqlx::query_scalar("SELECT count(*) FROM elements WHERE frame_id=?")
            .bind(id)
            .fetch_one(&reopened.pool)
            .await
            .unwrap();
        assert_eq!(elements, 1);
        drained(&reopened).await;
        reopened.close().await;
    }

    #[tokio::test]
    async fn acknowledged_replay_preserves_redaction_compaction_and_deletion() {
        let root = tempfile::tempdir().unwrap();
        let db = open(root.path()).await;
        let guard = db.write_semaphore.clone().acquire_owned().await.unwrap();
        let snapshot = screenshot(root.path());
        let admission = admit(&db, Utc::now(), &snapshot).await;
        let (path, bytes) = manifest(&db, &admission.capture_id);
        drop(guard);
        let id = indexed(&db, &admission.capture_id).await;
        drained(&db).await;
        db.execute_raw_sql_write(&format!("UPDATE frames SET full_text='redacted',accessibility_tree_json='[]',snapshot_path=NULL,image_redacted_at=123 WHERE id={id}")).await.unwrap();
        db.close().await;
        std::fs::write(&path, &bytes).unwrap();
        let reopened = open(root.path()).await;
        drained(&reopened).await;
        let row: (String, i64, Option<String>) = sqlx::query_as(
            "SELECT full_text,image_redacted_at,snapshot_path FROM frames WHERE id=?",
        )
        .bind(id)
        .fetch_one(&reopened.pool)
        .await
        .unwrap();
        assert_eq!(row, ("redacted".into(), 123, None));
        assert_eq!(
            reopened.last_capture_index_ts(),
            0,
            "receipt replay is not a new index write"
        );
        assert!(!Path::new(&snapshot).exists());
        reopened
            .execute_raw_sql_write(&format!(
                "DELETE FROM elements WHERE frame_id={id}; DELETE FROM frames WHERE id={id}"
            ))
            .await
            .unwrap();
        reopened.close().await;
        std::fs::write(&path, &bytes).unwrap();
        let final_db = open(root.path()).await;
        drained(&final_db).await;
        assert_eq!(
            final_db
                .capture_frame_id(&admission.capture_id)
                .await
                .unwrap(),
            None
        );
        let frames: i64 = sqlx::query_scalar("SELECT count(*) FROM frames")
            .fetch_one(&final_db.pool)
            .await
            .unwrap();
        assert_eq!(frames, 0);
        final_db.close().await;
    }

    #[tokio::test]
    async fn every_range_delete_excludes_pending_and_stale_queued_captures() {
        for variant in 0..4 {
            let root = tempfile::tempdir().unwrap();
            let db = open(root.path()).await;
            reject_frames(&db).await;
            let timestamp = Utc::now();
            let snapshot = screenshot(root.path());
            let admission = admit(&db, timestamp, &snapshot).await;
            assert_eq!(admission.frame_id, None);
            let (path, bytes) = manifest(&db, &admission.capture_id);
            let start = timestamp - ChronoDuration::seconds(1);
            let end = timestamp + ChronoDuration::seconds(1);
            match variant {
                0 => {
                    db.delete_time_range(start, end).await.unwrap();
                }
                1 => {
                    db.delete_time_range_local(start, end).await.unwrap();
                }
                2 => {
                    db.delete_time_range_batch(start, end, true).await.unwrap();
                }
                _ => {
                    db.delete_time_range_batch(start, end, false).await.unwrap();
                }
            }
            assert!(!Path::new(&snapshot).exists());
            assert!(!path.exists());
            assert_eq!(db.pending_capture_count(), 0);
            db.execute_raw_sql_write("DROP TRIGGER reject_capture")
                .await
                .unwrap();
            db.close().await;
            // Simulate a replay selected before the deletion commit / old file
            // surviving a crash: the persisted exclusion must still win.
            std::fs::write(&path, &bytes).unwrap();
            let reopened = open(root.path()).await;
            drained(&reopened).await;
            assert_eq!(
                reopened
                    .capture_frame_id(&admission.capture_id)
                    .await
                    .unwrap(),
                None
            );
            reopened.close().await;
        }
    }

    #[tokio::test]
    async fn media_lean_and_retention_cutoff_project_unindexed_captures() {
        for mode in ["media", "lean", "all"] {
            let root = tempfile::tempdir().unwrap();
            let db = open(root.path()).await;
            reject_frames(&db).await;
            let timestamp = Utc::now() - ChronoDuration::days(30);
            let snapshot = screenshot(root.path());
            let admission = admit(&db, timestamp, &snapshot).await;
            assert_eq!(db.get_oldest_timestamp().await.unwrap(), None);
            db.retain_pending_screen_captures(Utc::now() - ChronoDuration::days(14), mode)
                .await
                .unwrap();
            assert!(!Path::new(&snapshot).exists());
            db.execute_raw_sql_write("DROP TRIGGER reject_capture")
                .await
                .unwrap();
            if mode != "all" {
                let id = indexed(&db, &admission.capture_id).await;
                let row: (String, Option<String>, Option<String>) = sqlx::query_as(
                    "SELECT full_text,snapshot_path,accessibility_tree_json FROM frames WHERE id=?",
                )
                .bind(id)
                .fetch_one(&db.pool)
                .await
                .unwrap();
                assert_eq!(row.0, "safe capture");
                assert_eq!(row.1, None);
                assert_eq!(row.2.is_some(), mode == "media");
                let count: i64 =
                    sqlx::query_scalar("SELECT count(*) FROM elements WHERE frame_id=?")
                        .bind(id)
                        .fetch_one(&db.pool)
                        .await
                        .unwrap();
                assert_eq!(count, i64::from(mode == "media"));
            } else {
                assert_eq!(
                    db.capture_frame_id(&admission.capture_id).await.unwrap(),
                    None
                );
            }
            drained(&db).await;
            db.close().await;
        }
    }

    #[tokio::test]
    async fn direct_media_and_lean_hooks_never_restore_pending_pixels_or_details() {
        let root = tempfile::tempdir().unwrap();
        let db = open(root.path()).await;
        reject_frames(&db).await;
        let timestamp = Utc::now();
        let snapshot = screenshot(root.path());
        let admission = admit(&db, timestamp, &snapshot).await;
        let start = timestamp - ChronoDuration::seconds(1);
        let end = timestamp + ChronoDuration::seconds(1);
        db.evict_media_in_range(start, end).await.unwrap();
        db.strip_heavy_text_in_range(start, end).await.unwrap();
        db.execute_raw_sql_write("DROP TRIGGER reject_capture")
            .await
            .unwrap();
        let id = indexed(&db, &admission.capture_id).await;
        let row: (String, Option<String>, Option<String>) = sqlx::query_as(
            "SELECT full_text,snapshot_path,accessibility_tree_json FROM frames WHERE id=?",
        )
        .bind(id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(row, ("safe capture".into(), None, None));
        assert!(!Path::new(&snapshot).exists());
        drained(&db).await;
        db.close().await;
    }

    #[tokio::test]
    async fn handoff_latency_healthy_baseline_and_blocked_writer_p95() {
        fn p95(mut values: Vec<f64>) -> f64 {
            values.sort_by(f64::total_cmp);
            values[(values.len() * 95).div_ceil(100) - 1]
        }
        let root = tempfile::tempdir().unwrap();
        let db = open(root.path()).await;
        let mut baseline = Vec::new();
        let mut healthy = Vec::new();
        let mut healthy_indexed = 0;
        let mut blocked = Vec::new();
        for _ in 0..20 {
            let snapshot = screenshot(root.path());
            let now = std::time::Instant::now();
            db.insert_snapshot_frame_with_ocr(
                "test",
                Utc::now(),
                &snapshot,
                Some("test app"),
                Some("safe title"),
                None,
                None,
                true,
                Some("test"),
                Some("safe capture"),
                Some("accessibility"),
                Some(TREE),
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
            baseline.push(now.elapsed().as_secs_f64() * 1000.0);
        }
        for _ in 0..20 {
            let snapshot = screenshot(root.path());
            let now = std::time::Instant::now();
            let admission = admit(&db, Utc::now(), &snapshot).await;
            healthy.push(now.elapsed().as_secs_f64() * 1000.0);
            healthy_indexed += usize::from(admission.frame_id.is_some());
            indexed(&db, &admission.capture_id).await;
        }
        drained(&db).await;
        let guard = db.write_semaphore.clone().acquire_owned().await.unwrap();
        let mut captures = Vec::new();
        for _ in 0..20 {
            let snapshot = screenshot(root.path());
            let now = std::time::Instant::now();
            let admission = admit(&db, Utc::now(), &snapshot).await;
            blocked.push(now.elapsed().as_secs_f64() * 1000.0);
            assert_eq!(admission.frame_id, None);
            captures.push(admission.capture_id);
        }
        assert_eq!(db.pending_capture_count(), 20);
        let blocked_p95 = p95(blocked);
        assert!(
            blocked_p95 < 750.0,
            "SQLite waiting must be bounded, p95={blocked_p95}"
        );
        drop(guard);
        let recovery = std::time::Instant::now();
        for capture in &captures {
            indexed(&db, capture).await;
        }
        drained(&db).await;
        println!("capture handoff latency (20 samples each): legacy_p95_ms={:.3} healthy_p95_ms={:.3} blocked_p95_ms={:.3} recovery_ms={:.3} healthy_direct_indexed={healthy_indexed}/20",
            p95(baseline),p95(healthy),blocked_p95,recovery.elapsed().as_secs_f64()*1000.0);
        db.close().await;
    }

    #[tokio::test]
    async fn database_reset_does_not_adopt_pending_old_source() {
        let root = tempfile::tempdir().unwrap();
        let db = open(root.path()).await;
        reject_frames(&db).await;
        let snapshot = screenshot(root.path());
        let admission = admit(&db, Utc::now(), &snapshot).await;
        let (path, _) = manifest(&db, &admission.capture_id);
        let old_source = db.capture_journal.as_ref().unwrap().source_id.clone();
        db.close().await;
        std::fs::rename(
            root.path().join("db.sqlite"),
            root.path().join("old.sqlite"),
        )
        .unwrap();
        let fresh = open(root.path()).await;
        assert_ne!(
            old_source,
            fresh.capture_journal.as_ref().unwrap().source_id
        );
        assert_eq!(
            fresh.capture_frame_id(&admission.capture_id).await.unwrap(),
            None
        );
        assert_eq!(fresh.pending_capture_count(), 0);
        assert!(path.exists());
        assert!(Path::new(&snapshot).exists());
        fresh.close().await;
    }
}
