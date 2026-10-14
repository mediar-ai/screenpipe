// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Durable release receipts. Recording owns the source; only a completed
//! detector may publish a particular source revision under the active policy.
//! Neither inference nor network I/O runs while holding the writer.

use super::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReleasePolicy {
    pub identity: String,
    pub text: bool,
    pub images: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReleaseJob {
    pub kind: String,
    pub id: String,
    pub revision: i64,
    pub policy: String,
    pub values: BTreeMap<String, Option<String>>,
    pub storage_generation: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReadyChange {
    pub sequence: i64,
    pub kind: String,
    pub id: String,
    pub revision: i64,
}

pub(crate) struct Surface {
    pub kind: &'static str,
    pub table: &'static str,
    pub columns: &'static [&'static str],
}

// Every exported free-text field belongs to one receipt. Structural fields
// (IDs, times, geometry) remain unchanged. Images have an independent receipt.
pub(crate) const SURFACES: &[Surface] = &[
    Surface {
        kind: "frames",
        table: "frames",
        columns: &[
            "full_text",
            "accessibility_text",
            "accessibility_tree_json",
            "text_json",
            "window_name",
            "browser_url",
        ],
    },
    Surface {
        kind: "audio",
        table: "audio_transcriptions",
        columns: &["transcription", "device"],
    },
    Surface {
        kind: "input",
        table: "ui_events",
        columns: &[
            "text_content",
            "element_value",
            "element_description",
            "element_ancestors",
            "window_title",
            "browser_url",
            "element_name",
        ],
    },
    Surface {
        kind: "elements",
        table: "elements",
        columns: &["text", "properties"],
    },
    Surface {
        kind: "memory",
        table: "memories",
        columns: &["content", "source", "source_context", "tags"],
    },
    Surface {
        kind: "parsed",
        table: "semantic_items",
        columns: &["title", "body", "actor", "status", "metadata_json"],
    },
    Surface {
        kind: "segments",
        table: "meeting_transcript_segments",
        columns: &["transcript", "speaker_name", "device_name"],
    },
    Surface {
        kind: "image",
        table: "frames",
        columns: &["snapshot_path", "name"],
    },
];

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS _privacy_policy(id INTEGER PRIMARY KEY CHECK(id=1),identity TEXT NOT NULL,text_required INTEGER NOT NULL,image_required INTEGER NOT NULL,epoch INTEGER NOT NULL DEFAULT 0,revocation INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO _privacy_policy VALUES(1,'',0,0,0,0);
CREATE TABLE IF NOT EXISTS _privacy_release(kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,policy TEXT,attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER,PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS _privacy_ready(sequence INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,policy TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS _privacy_pending ON _privacy_release(kind,retry_at) WHERE policy IS NULL;
"#;

fn err(message: &str) -> sqlx::Error {
    sqlx::Error::Protocol(message.into())
}

impl DatabaseManager {
    /// Configure before exposing the API or starting sync. Existing timestamp
    /// markers deliberately confer no release authority.
    pub async fn configure_release(&self, policy: &ReleasePolicy) -> Result<(), sqlx::Error> {
        if (policy.text || policy.images) && policy.identity.is_empty() {
            return Err(err("privacy policy identity is required"));
        }
        let mut tx = self.begin_immediate_with_retry().await?;
        sqlx::raw_sql(SCHEMA).execute(&mut **tx.conn()).await?;
        sqlx::query("UPDATE _privacy_policy SET identity=?,text_required=?,image_required=?,epoch=epoch+1,revocation=revocation+1 WHERE identity!=? OR text_required!=? OR image_required!=?")
            .bind(&policy.identity).bind(policy.text).bind(policy.images).bind(&policy.identity).bind(policy.text).bind(policy.images).execute(&mut **tx.conn()).await?;
        for surface in SURFACES {
            let physical = if surface.table == "elements"
                && self.storage.as_ref().is_some_and(|s| s.has_bulk())
            {
                "_bulk_element_rows"
            } else {
                surface.table
            };
            let table_type: Option<String> =
                sqlx::query_scalar("SELECT type FROM sqlite_master WHERE name=?")
                    .bind(physical)
                    .fetch_optional(&mut **tx.conn())
                    .await?;
            // The specialized hybrid elements virtual table cannot own normal
            // triggers. Keep it closed until its adapter certifies revisions.
            if table_type.as_deref() != Some("table") {
                continue;
            }
            let columns: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info(?)")
                .bind(physical)
                .fetch_all(&mut **tx.conn())
                .await?;
            if !surface
                .columns
                .iter()
                .all(|c| columns.iter().any(|existing| existing == c))
            {
                continue;
            }
            let changed = surface
                .columns
                .iter()
                .map(|c| format!("NEW.\"{c}\" IS NOT OLD.\"{c}\""))
                .collect::<Vec<_>>()
                .join(" OR ");
            let names = surface
                .columns
                .iter()
                .map(|c| format!("\"{c}\""))
                .collect::<Vec<_>>()
                .join(",");
            for event in ["INSERT", "UPDATE", "DELETE"] {
                let id = if event == "DELETE" {
                    "OLD.id"
                } else {
                    "NEW.id"
                };
                let clause = if event == "UPDATE" {
                    format!("UPDATE OF {names}")
                } else {
                    event.into()
                };
                let maintenance = if self.storage.is_some() && surface.table == "frames" {
                    " AND (SELECT maintenance=0 FROM storage_metadata WHERE singleton=1)"
                } else {
                    ""
                };
                let kind = surface.kind;
                let requirement = if kind == "image" {
                    "image_required"
                } else {
                    "text_required"
                };
                let active = format!("((SELECT {requirement} FROM _privacy_policy WHERE id=1)=1 OR EXISTS(SELECT 1 FROM _privacy_release WHERE kind='{kind}' AND id=CAST({id} AS TEXT) AND policy IS NOT NULL))");
                let when = if event == "UPDATE" {
                    format!("WHEN {active} AND ({changed}){maintenance}")
                } else {
                    format!("WHEN {active}")
                };
                let table = physical;
                let sql = format!("CREATE TRIGGER IF NOT EXISTS privacy_{kind}_{event} AFTER {clause} ON {table} {when} BEGIN
                  UPDATE _privacy_policy SET epoch=epoch+1,revocation=revocation+1 WHERE EXISTS(SELECT 1 FROM _privacy_release WHERE kind='{kind}' AND id=CAST({id} AS TEXT) AND policy IS NOT NULL);
                  INSERT INTO _privacy_release(kind,id,revision) VALUES('{kind}',CAST({id} AS TEXT),1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1,policy=NULL,attempts=0,retry_at=NULL;
                  END;");
                sqlx::raw_sql(sqlx::AssertSqlSafe(sql))
                    .execute(&mut **tx.conn())
                    .await?;
            }
        }
        if self.storage.is_some() {
            sqlx::raw_sql("CREATE TRIGGER IF NOT EXISTS privacy_frame_generation AFTER UPDATE OF generation ON frame_payloads WHEN NEW.generation != OLD.generation BEGIN
              UPDATE _privacy_policy SET epoch=epoch+1,revocation=revocation+1 WHERE EXISTS(SELECT 1 FROM _privacy_release WHERE kind='frames' AND id=CAST(NEW.frame_id AS TEXT) AND policy IS NOT NULL);
              INSERT INTO _privacy_release(kind,id,revision) VALUES('frames',CAST(NEW.frame_id AS TEXT),1) ON CONFLICT(kind,id) DO UPDATE SET revision=revision+1,policy=NULL,attempts=0,retry_at=NULL;
            END;").execute(&mut **tx.conn()).await?;
        }
        tx.commit().await?;
        if policy.text {
            self.set_frame_privacy_policy(&crate::storage::PrivacyPolicy {
                identity: policy.identity.clone(),
                required_surfaces: 63,
            })
            .await?;
        }
        Ok(())
    }

    pub async fn release_policy(&self) -> Result<ReleasePolicy, sqlx::Error> {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='_privacy_policy')",
        )
        .fetch_one(&self.pool)
        .await?;
        if !exists {
            return Ok(ReleasePolicy::default());
        }
        let row = sqlx::query(
            "SELECT identity,text_required,image_required FROM _privacy_policy WHERE id=1",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(ReleasePolicy {
            identity: row.get("identity"),
            text: row.get("text_required"),
            images: row.get("image_required"),
        })
    }

    pub async fn release_pending(
        &self,
        kind: &str,
        limit: u32,
    ) -> Result<Vec<ReleaseJob>, sqlx::Error> {
        self.release_pending_aged(kind, limit, 0).await
    }

    pub async fn release_pending_aged(
        &self,
        kind: &str,
        limit: u32,
        min_age_seconds: i64,
    ) -> Result<Vec<ReleaseJob>, sqlx::Error> {
        let surface = SURFACES
            .iter()
            .find(|s| s.kind == kind)
            .ok_or_else(|| err("unknown privacy surface"))?;
        let policy = self.release_policy().await?;
        if !(if kind == "image" {
            policy.images
        } else {
            policy.text
        }) {
            return Ok(vec![]);
        }
        let columns = surface
            .columns
            .iter()
            .map(|c| format!("s.\"{c}\""))
            .collect::<Vec<_>>()
            .join(",");
        let age = if kind == "image" {
            format!(
                " AND unixepoch(s.timestamp)<=unixepoch()-{}",
                min_age_seconds.max(0)
            )
        } else {
            String::new()
        };
        let sql = format!("SELECT CAST(s.id AS TEXT) AS source_id,COALESCE(r.revision,0) AS revision,{columns} FROM {} s LEFT JOIN _privacy_release r ON r.kind=? AND r.id=CAST(s.id AS TEXT) WHERE (r.policy IS NULL OR r.policy!=?) AND (r.retry_at IS NULL OR r.retry_at<=strftime('%s','now')){age} ORDER BY s.id DESC LIMIT ?", surface.table);
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(kind)
            .bind(&policy.identity)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;
        let mut jobs: Vec<ReleaseJob> = rows
            .iter()
            .map(|row| {
                let values = surface
                    .columns
                    .iter()
                    .map(|c| Ok((c.to_string(), row.try_get(*c)?)))
                    .collect::<Result<_, sqlx::Error>>()?;
                Ok(ReleaseJob {
                    kind: kind.into(),
                    id: row.try_get("source_id")?,
                    revision: row.try_get("revision")?,
                    policy: policy.identity.clone(),
                    values,
                    storage_generation: None,
                })
            })
            .collect::<Result<_, sqlx::Error>>()?;
        if self.storage.is_some() && kind == "frames" {
            let ids = jobs
                .iter()
                .filter_map(|j| j.id.parse().ok())
                .collect::<Vec<i64>>();
            let mut payloads = self
                .frame_payloads(&ids, crate::storage::Projection::All)
                .await?;
            for job in &mut jobs {
                let payload = payloads
                    .remove(&job.id.parse().map_err(|_| err("invalid frame id"))?)
                    .ok_or_else(|| err("frame changed during privacy read"))?;
                job.storage_generation = Some(payload.generation);
                job.values.insert("full_text".into(), payload.full_text);
                job.values
                    .insert("accessibility_text".into(), payload.accessibility_text);
                job.values.insert(
                    "accessibility_tree_json".into(),
                    payload.accessibility_tree_json,
                );
                job.values.insert("text_json".into(), payload.text_json);
            }
        }
        Ok(jobs)
    }

    /// Commit sanitized values and their receipt together. A concurrent source
    /// edit or policy change rejects the complete result, leaving it retryable.
    pub async fn publish_release(
        &self,
        job: &ReleaseJob,
        values: &BTreeMap<String, Option<String>>,
    ) -> Result<bool, sqlx::Error> {
        let surface = SURFACES
            .iter()
            .find(|s| s.kind == job.kind)
            .ok_or_else(|| err("unknown privacy surface"))?;
        if values.len() != surface.columns.len()
            || !surface.columns.iter().all(|c| values.contains_key(*c))
        {
            return Err(err("incomplete privacy result"));
        }
        if job.kind == "image" {
            return Err(err("image certification requires the media adapter"));
        }
        // Hybrid frame replacements must use generation-aware storage. Never
        // update archived payload columns through raw SQL.
        if self.storage.is_some() && surface.table == "frames" {
            let payload = crate::storage::FramePayload {
                id: job.id.parse().map_err(|_| err("invalid frame id"))?,
                generation: job
                    .storage_generation
                    .ok_or_else(|| err("missing frame generation"))?,
                full_text: values["full_text"].clone(),
                accessibility_text: values["accessibility_text"].clone(),
                accessibility_tree_json: values["accessibility_tree_json"].clone(),
                text_json: values["text_json"].clone(),
            };
            return self
                .replace_frame_payload_with_release(
                    &payload,
                    &job.policy,
                    63,
                    values["window_name"].as_deref(),
                    values["browser_url"].as_deref(),
                    Some(job),
                )
                .await;
        }
        let mut tx = self.begin_immediate_with_retry().await?;
        let current: (String, i64) = sqlx::query_as("SELECT identity,COALESCE((SELECT revision FROM _privacy_release WHERE kind=? AND id=?),0) FROM _privacy_policy WHERE id=1").bind(&job.kind).bind(&job.id).fetch_one(&mut **tx.conn()).await?;
        if current != (job.policy.clone(), job.revision) {
            return Ok(false);
        }
        let set = surface
            .columns
            .iter()
            .map(|c| format!("\"{c}\"=?"))
            .collect::<Vec<_>>()
            .join(",");
        let mut query = sqlx::query(sqlx::AssertSqlSafe(format!(
            "UPDATE {} SET {set} WHERE id=?",
            surface.table
        )));
        for column in surface.columns {
            query = query.bind(values.get(*column).unwrap());
        }
        if query
            .bind(&job.id)
            .execute(&mut **tx.conn())
            .await?
            .rows_affected()
            == 0
        {
            return Ok(false);
        }
        certify(&mut **tx.conn(), job).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn release_ready(&self, kind: &str, id: &str) -> Result<bool, sqlx::Error> {
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM _privacy_release r JOIN _privacy_policy p ON p.identity=r.policy WHERE r.kind=? AND r.id=?)")
            .bind(kind).bind(id).fetch_one(&self.pool).await
    }

    pub async fn ready_changes(
        &self,
        after: i64,
        limit: u32,
    ) -> Result<Vec<ReadyChange>, sqlx::Error> {
        let rows=sqlx::query("SELECT c.sequence,c.kind,c.id,c.revision FROM _privacy_ready c JOIN _privacy_release r ON r.kind=c.kind AND r.id=c.id AND r.revision=c.revision AND r.policy=c.policy JOIN _privacy_policy p ON p.identity=c.policy WHERE c.sequence>? ORDER BY c.sequence LIMIT ?")
            .bind(after).bind(limit).fetch_all(&self.pool).await?;
        rows.iter()
            .map(|r| {
                Ok(ReadyChange {
                    sequence: r.try_get("sequence")?,
                    kind: r.try_get("kind")?,
                    id: r.try_get("id")?,
                    revision: r.try_get("revision")?,
                })
            })
            .collect()
    }
}

impl DatabaseManager {
    pub fn protected_reads_enabled(&self) -> bool {
        self.release_owner.is_some()
    }

    /// A separate read adapter shares the existing writer and its owner. Raw
    /// internal worker reads never accidentally inherit consumer filtering.
    pub async fn protected_reads(self: &Arc<Self>) -> Result<Arc<Self>, sqlx::Error> {
        if self.release_owner.is_some() {
            return Ok(Arc::clone(self));
        }
        let policy = self.release_policy().await?;
        if !policy.text && !policy.images {
            return Ok(Arc::clone(self));
        }
        let storage = self.storage.clone();
        let mut views = Vec::new();
        for surface in SURFACES.iter().filter(|s| s.kind != "image") {
            let exists: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name=?)")
                    .bind(surface.table)
                    .fetch_one(&self.pool)
                    .await?;
            if !exists {
                continue;
            }
            let logical = format!("_bulk_logical_{}", surface.table);
            let bulk: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name=?)")
                    .bind(&logical)
                    .fetch_one(&self.pool)
                    .await?;
            let source = if bulk { logical } else { surface.table.into() };
            let columns: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info(?)")
                .bind(surface.table)
                .fetch_all(&self.pool)
                .await?;
            let projection=columns.iter().map(|column| {
                if surface.table=="frames" && matches!(column.as_str(),"name"|"snapshot_path"|"video_chunk_id") {
                    format!("CASE WHEN (SELECT image_required=0 FROM _privacy_policy WHERE id=1) OR EXISTS(SELECT 1 FROM _privacy_release r JOIN _privacy_policy p ON p.identity=r.policy WHERE r.kind='image' AND r.id=CAST(s.id AS TEXT)) THEN s.\"{column}\" END AS \"{column}\"")
                } else {format!("s.\"{column}\"")}
            }).collect::<Vec<_>>().join(",");
            views.push(format!("DROP VIEW IF EXISTS temp.{t}; CREATE TEMP VIEW {t} AS SELECT {projection} FROM main.{source} s WHERE (SELECT text_required=0 FROM _privacy_policy WHERE id=1) OR EXISTS(SELECT 1 FROM _privacy_release r JOIN _privacy_policy p ON p.identity=r.policy WHERE r.kind='{kind}' AND r.id=CAST(s.id AS TEXT));",t=surface.table,kind=surface.kind));
        }
        // These derivatives do not yet carry source-bound receipts. Empty
        // views prevent alternate joins from bypassing captured-text gates.
        for table in [
            "meetings",
            "speakers",
            "semantic_actors",
            "outputs",
            "feedback",
            "pipe_executions",
        ] {
            let exists: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name=?)")
                    .bind(table)
                    .fetch_one(&self.pool)
                    .await?;
            if exists {
                views.push(format!("DROP VIEW IF EXISTS temp.{table}; CREATE TEMP VIEW {table} AS SELECT * FROM main.{table} WHERE (SELECT text_required=0 FROM _privacy_policy WHERE id=1);"));
            }
        }
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(self.pool.options().get_max_connections())
            .acquire_timeout(Duration::from_secs(5))
            .after_connect(move |conn, _| {
                let storage = storage.clone();
                let views = views.clone();
                Box::pin(async move {
                    if let Some(storage) = storage.filter(|s| s.has_bulk()) {
                        crate::storage::bulk::register_connection(conn, storage, true).await?;
                    }
                    sqlx::query("PRAGMA query_only=OFF")
                        .execute(&mut *conn)
                        .await?;
                    for view in views {
                        sqlx::raw_sql(sqlx::AssertSqlSafe(view))
                            .execute(&mut *conn)
                            .await?;
                    }
                    sqlx::query("PRAGMA query_only=ON")
                        .execute(&mut *conn)
                        .await?;
                    Ok(())
                })
            })
            .connect_with(self.pool.connect_options().as_ref().clone())
            .await?;
        crate::recovery::register_database_pool(self.pool.connect_options().get_filename(), &pool);
        let mut registry = self.release_read_pools.lock().await;
        if self.close_token.is_cancelled() {
            drop(registry);
            pool.close().await;
            return Err(sqlx::Error::PoolClosed);
        }
        registry.push(pool.clone());
        drop(registry);
        Ok(Arc::new(Self {
            release_owner: Some(Arc::clone(self)),
            release_read_pools: Arc::clone(&self.release_read_pools),
            storage: self.storage.clone(),
            upload_source_id: tokio::sync::OnceCell::new(),
            pool,
            write_pool: self.write_pool.clone(),
            write_semaphore: Arc::clone(&self.write_semaphore),
            heavy_read_semaphore: Arc::clone(&self.heavy_read_semaphore),
            write_queue: self.write_queue.clone(),
            write_queue_health: self.write_queue_health.clone(),
            persistent_failure_hook: self.persistent_failure_hook.clone(),
            manager_lease: None,
            close_token: self.close_token.clone(),
        }))
    }

    /// Revokes assembled uploads only when already released content or the
    /// policy changes. New completions do not starve an in-flight batch.
    pub async fn release_revocation(&self) -> Result<Option<i64>, sqlx::Error> {
        let policy = self.release_policy().await?;
        if !policy.text && !policy.images {
            return Ok(None);
        }
        sqlx::query_scalar("SELECT revocation FROM _privacy_policy WHERE id=1")
            .fetch_one(&self.pool)
            .await
            .map(Some)
    }

    pub async fn release_epoch(&self) -> Result<Option<i64>, sqlx::Error> {
        if self.release_owner.is_none() {
            return Ok(None);
        }
        sqlx::query_scalar("SELECT epoch FROM _privacy_policy WHERE id=1")
            .fetch_one(&self.pool)
            .await
            .map(Some)
    }
}

// Called only in the same writer transaction as the sanitized replacement.
pub(crate) async fn certify(
    conn: &mut sqlx::SqliteConnection,
    job: &ReleaseJob,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO _privacy_release(kind,id,revision,policy) VALUES(?,?,0,?) ON CONFLICT(kind,id) DO UPDATE SET policy=excluded.policy,attempts=0,retry_at=NULL")
        .bind(&job.kind).bind(&job.id).bind(&job.policy).execute(&mut *conn).await?;
    sqlx::query("UPDATE _privacy_policy SET epoch=epoch+1 WHERE id=1")
        .execute(&mut *conn)
        .await?;
    sqlx::query("INSERT INTO _privacy_ready(kind,id,revision,policy) SELECT kind,id,revision,policy FROM _privacy_release WHERE kind=? AND id=?")
        .bind(&job.kind).bind(&job.id).execute(&mut *conn).await?;
    Ok(())
}

impl DatabaseManager {
    pub async fn defer_release(&self, job: &ReleaseJob) -> Result<(), sqlx::Error> {
        let mut tx = self.begin_immediate_with_retry().await?;
        sqlx::query("INSERT INTO _privacy_release(kind,id,revision,attempts,retry_at) VALUES(?,?,?,1,strftime('%s','now')+30) ON CONFLICT(kind,id) DO UPDATE SET attempts=attempts+1,retry_at=strftime('%s','now')+MIN(3600,30*(attempts+1)) WHERE revision=? AND policy IS NULL")
            .bind(&job.kind).bind(&job.id).bind(job.revision).bind(job.revision).execute(&mut **tx.conn()).await?;
        tx.commit().await
    }
}

impl DatabaseManager {
    /// The image adapter calls this only after successful inference and a
    /// durable atomic replacement. Missing/legacy media never calls it.
    pub async fn publish_image_release(&self, job: &ReleaseJob) -> Result<bool, sqlx::Error> {
        if job.kind != "image" {
            return Err(err("expected image receipt"));
        }
        let mut tx = self.begin_immediate_with_retry().await?;
        let current:(String,i64)=sqlx::query_as("SELECT identity,COALESCE((SELECT revision FROM _privacy_release WHERE kind='image' AND id=?),0) FROM _privacy_policy WHERE id=1").bind(&job.id).fetch_one(&mut **tx.conn()).await?;
        if current != (job.policy.clone(), job.revision) {
            return Ok(false);
        }
        let updated =
            sqlx::query("UPDATE frames SET image_redacted_at=strftime('%s','now') WHERE id=?")
                .bind(&job.id)
                .execute(&mut **tx.conn())
                .await?;
        if updated.rows_affected() == 0 {
            return Ok(false);
        }
        certify(&mut **tx.conn(), job).await?;
        tx.commit().await?;
        Ok(true)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReleasePage {
    pub sequence: i64,
    pub more: bool,
    pub rows: serde_json::Value,
}

impl DatabaseManager {
    /// Export in completion order, preserving each record's original capture
    /// timestamp. A fixed enrollment cutoff limits what history can leave.
    pub async fn release_export_page(
        &self,
        kind: &str,
        after: i64,
        cutoff: &str,
        limit: u32,
    ) -> Result<ReleasePage, sqlx::Error> {
        if !self.protected_reads_enabled() {
            return Err(err("protected read adapter required"));
        }
        let (table,projection,time)=match kind {
            "frames"=>("frames","s.id AS frame_id,s.timestamp,s.app_name,s.window_name,s.browser_url,COALESCE(s.full_text,s.accessibility_text,'') AS text","timestamp"),
            "audio"=>("audio_transcriptions","s.id AS transcription_id,s.timestamp,s.transcription,NULL AS speaker,s.device","timestamp"),
            "input"=>("ui_events","s.id AS event_id,s.timestamp,s.event_type,s.app_name,s.window_title,s.browser_url,s.element_role,s.element_name,s.text_content","timestamp"),
            "memory"=>("memories","s.id AS memory_id,s.created_at,s.updated_at,s.content,s.source,s.tags,s.importance,s.frame_id","created_at"),
            _=>return Err(err("privacy export surface is not supported")),
        };
        let sequence:i64=sqlx::query_scalar("SELECT COALESCE(MAX(sequence),?) FROM (SELECT sequence FROM _privacy_ready WHERE kind=? AND sequence>? ORDER BY sequence LIMIT ?)")
            .bind(after).bind(kind).bind(after).bind(limit.min(500)).fetch_one(&self.pool).await?;
        let sql=format!("SELECT {projection} FROM _privacy_ready c JOIN _privacy_release r ON r.kind=c.kind AND r.id=c.id AND r.revision=c.revision AND r.policy=c.policy JOIN _privacy_policy p ON p.identity=c.policy JOIN {table} s ON s.id=c.id WHERE c.kind=? AND c.sequence>? AND c.sequence<=? AND julianday(s.{time})>=julianday(?) ORDER BY c.sequence");
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(kind)
            .bind(after)
            .bind(sequence)
            .bind(cutoff)
            .fetch_all(&self.pool)
            .await?;
        let mut rows = Self::raw_sql_rows(&rows);
        if let Some(items) = rows.as_array_mut() {
            if kind == "memory" {
                for item in items.iter_mut() {
                    if let Some(tags) = item.get("tags").and_then(|v| v.as_str()) {
                        item["tags"] =
                            serde_json::from_str(tags).map_err(|_| err("invalid memory tags"))?;
                    }
                }
            }
            if kind == "frames" && self.storage.is_some() {
                let ids = items
                    .iter()
                    .filter_map(|i| i["frame_id"].as_i64())
                    .collect::<Vec<_>>();
                let payloads = self
                    .frame_payloads(&ids, crate::storage::Projection::Search)
                    .await?;
                for item in items.iter_mut() {
                    let id = item["frame_id"]
                        .as_i64()
                        .ok_or_else(|| err("invalid frame id"))?;
                    let payload = payloads
                        .get(&id)
                        .ok_or_else(|| err("frame changed during export"))?;
                    item["text"] = serde_json::json!(payload
                        .full_text
                        .as_ref()
                        .or(payload.accessibility_text.as_ref()));
                }
            }
        }
        let more: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM _privacy_ready WHERE kind=? AND sequence>?)",
        )
        .bind(kind)
        .bind(sequence)
        .fetch_one(&self.pool)
        .await?;
        Ok(ReleasePage {
            sequence,
            rows,
            more,
        })
    }
}
