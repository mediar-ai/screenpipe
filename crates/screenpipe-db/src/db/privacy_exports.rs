// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Versioned upload projections for derived records. Sources remain local and
//! unchanged; the existing release worker processes only the extracted text.
use super::privacy_release::ReleasePage;
use super::*;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

pub(crate) async fn install(conn: &mut sqlx::SqliteConnection) -> Result<(), SqlxError> {
    sqlx::raw_sql(r#"
CREATE TABLE IF NOT EXISTS _privacy_exports(id INTEGER PRIMARY KEY AUTOINCREMENT,stream TEXT NOT NULL,source_id TEXT NOT NULL,source_version TEXT NOT NULL,timestamp TEXT NOT NULL,template_json TEXT NOT NULL,text_json TEXT NOT NULL,UNIQUE(stream,source_id));
CREATE TABLE IF NOT EXISTS _privacy_export_sources(stream TEXT NOT NULL,source_id TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,pending INTEGER NOT NULL DEFAULT 1,delivered_version TEXT,PRIMARY KEY(stream,source_id));
CREATE INDEX IF NOT EXISTS privacy_export_pending ON _privacy_export_sources(stream,pending,source_id);
CREATE TABLE IF NOT EXISTS _privacy_export_scan(stream TEXT PRIMARY KEY,after_id INTEGER NOT NULL DEFAULT 0,complete INTEGER NOT NULL DEFAULT 0);
"#).execute(&mut *conn).await?;
    // Source changes revoke a prepared payload in the source's own transaction.
    // A queue entry contains only an identifier, never a per-frame payload copy.
    for (table, stream, key) in [
        ("frames", "parsed", "SELECT CAST({row}.id AS TEXT) WHERE {row}.semantic_run_id IS NOT NULL"),
        ("semantic_runs", "parsed", "SELECT CAST(id AS TEXT) FROM frames WHERE semantic_run_id={row}.id"),
        ("semantic_items", "parsed", "SELECT CAST(f.id AS TEXT) FROM frames f JOIN semantic_run_items ri ON ri.run_id=f.semantic_run_id WHERE ri.item_id={row}.id"),
        ("semantic_run_items", "parsed", "SELECT CAST(id AS TEXT) FROM frames WHERE semantic_run_id={row}.run_id"),
        ("semantic_item_actors", "parsed", "SELECT CAST(f.id AS TEXT) FROM frames f JOIN semantic_run_items ri ON ri.run_id=f.semantic_run_id WHERE ri.item_id={row}.item_id"),
        ("semantic_actors", "parsed", "SELECT CAST(f.id AS TEXT) FROM frames f JOIN semantic_run_items ri ON ri.run_id=f.semantic_run_id JOIN semantic_item_actors ia ON ia.item_id=ri.item_id WHERE ia.actor_id={row}.id"),
        ("feedback", "feedback", "SELECT {row}.id"),
    ] {
        for event in ["INSERT", "UPDATE", "DELETE"] {
            let keys = match event {
                "INSERT" => key.replace("{row}", "NEW"),
                "DELETE" => key.replace("{row}", "OLD"),
                _ => format!("{} UNION {}", key.replace("{row}", "OLD"), key.replace("{row}", "NEW")),
            };
            // Frame text/metadata unrelated to parsed output need no work.
            let clause = if table == "frames" && event == "UPDATE" {
                "UPDATE OF semantic_run_id,timestamp,app_name,window_name,browser_url"
            } else { event };
            let changed = if table == "frames" && event == "UPDATE" {
                " AND (NEW.semantic_run_id IS NOT OLD.semantic_run_id OR NEW.timestamp IS NOT OLD.timestamp OR NEW.app_name IS NOT OLD.app_name OR NEW.window_name IS NOT OLD.window_name OR NEW.browser_url IS NOT OLD.browser_url)"
            } else { "" };
            let sql = format!("CREATE TRIGGER IF NOT EXISTS privacy_export_{table}_{event} BEFORE {clause} ON {table} WHEN ((SELECT text_required FROM _privacy_policy WHERE id=1)=1 OR EXISTS(SELECT 1 FROM _privacy_exports)){changed} BEGIN
DELETE FROM _privacy_exports WHERE stream='{stream}' AND source_id IN ({keys});
INSERT INTO _privacy_export_sources(stream,source_id) SELECT '{stream}',* FROM ({keys}) AS affected WHERE 1 ON CONFLICT(stream,source_id) DO UPDATE SET version=version+1,pending=1,delivered_version=NULL;
END");
            sqlx::raw_sql(sqlx::AssertSqlSafe(sql)).execute(&mut *conn).await?;
        }
    }
    Ok(())
}

pub fn export_version(value: &Value) -> Result<String, SqlxError> {
    let bytes = serde_json::to_vec(value).map_err(|e| SqlxError::Protocol(e.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

/// The desktop history is outside SQLite; transport must validate its exact
/// source versions under the same lock used by history saves.
pub fn validate_activity_exports(
    expected: &BTreeMap<String, String>,
    rows: &[Value],
) -> Result<(), SqlxError> {
    let current = rows
        .iter()
        .map(|row| {
            let id = row["activity_id"]
                .as_str()
                .ok_or_else(|| SqlxError::Protocol("activity ID missing".into()))?;
            Ok((id, export_version(row)?))
        })
        .collect::<Result<BTreeMap<_, _>, SqlxError>>()?;
    if expected
        .iter()
        .any(|(id, version)| current.get(id.as_str()) != Some(version))
    {
        return Err(SqlxError::Protocol(
            "activity changed during privacy export; retry pending".into(),
        ));
    }
    Ok(())
}

/// Extract only content strings; stable record IDs, hierarchy and timestamps
/// stay in the template. JSON pointer keys are never sent to the detector.
fn split_payload(stream: &str, value: &Value) -> Result<(Value, Value), SqlxError> {
    if !matches!(stream, "activities" | "parsed" | "feedback") {
        return Err(SqlxError::Protocol(
            "unsupported derived privacy stream".into(),
        ));
    }
    // Content is the default, so adding a new wire field cannot silently bypass
    // processing. Only known schema identifiers/times remain unchanged.
    fn structural(stream: &str, path: &[String]) -> bool {
        let key = path.last().map(String::as_str).unwrap_or("");
        match (stream, path.len(), path.first().map(String::as_str)) {
            ("activities", 1, _) => matches!(
                key,
                "activity_id" | "activity_kind" | "timestamp" | "start_at" | "end_at"
            ),
            ("activities", 3, Some("evidence")) => matches!(key, "kind" | "at"),
            ("parsed", 1, _) => matches!(
                key,
                "timestamp" | "parser_id" | "parser_version" | "app_platform"
            ),
            ("parsed", 3, Some("items")) => matches!(
                key,
                "local_id"
                    | "parent_local_id"
                    | "kind"
                    | "identity_quality"
                    | "occurred_at"
                    | "timestamp_precision"
            ),
            ("parsed", 3, Some("actors")) => matches!(key, "local_id" | "assignment_source"),
            ("feedback", 1, _) => matches!(
                key,
                "feedback_id"
                    | "target_kind"
                    | "target_id"
                    | "target_version"
                    | "actor_id"
                    | "rating"
                    | "created_at"
                    | "updated_at"
            ),
            _ => false,
        }
    }
    fn extract(
        stream: &str,
        value: &mut Value,
        path: &mut Vec<String>,
        texts: &mut Map<String, Value>,
    ) {
        match value {
            Value::String(_) if !structural(stream, path) => {
                let pointer = path
                    .iter()
                    .map(|p| format!("/{}", p.replace('~', "~0").replace('/', "~1")))
                    .collect::<String>();
                texts.insert(pointer, value.take());
            }
            Value::Array(items) => {
                for (i, item) in items.iter_mut().enumerate() {
                    path.push(i.to_string());
                    extract(stream, item, path, texts);
                    path.pop();
                }
            }
            Value::Object(items) => {
                for (key, item) in items {
                    path.push(key.clone());
                    extract(stream, item, path, texts);
                    path.pop();
                }
            }
            _ => {}
        }
    }
    let mut template = value.clone();
    let mut texts = Map::new();
    extract(stream, &mut template, &mut Vec::new(), &mut texts);
    Ok((template, Value::Object(texts)))
}

impl DatabaseManager {
    async fn stage_derived_export(
        &self,
        stream: &str,
        id: &str,
        version: &str,
        timestamp: &str,
        value: &Value,
        expected_source: Option<i64>,
    ) -> Result<(), SqlxError> {
        let (template, texts) = split_payload(stream, value)?;
        let mut tx = self.begin_immediate_with_retry().await?;
        if let Some(expected) = expected_source {
            let current: Option<i64> = sqlx::query_scalar(
                "SELECT version FROM _privacy_export_sources WHERE stream=? AND source_id=?",
            )
            .bind(stream)
            .bind(id)
            .fetch_optional(&mut **tx.conn())
            .await?;
            if current != Some(expected) {
                return Ok(());
            }
        }
        let delivered: Option<String> = sqlx::query_scalar(
            "SELECT delivered_version FROM _privacy_export_sources WHERE stream=? AND source_id=?",
        )
        .bind(stream)
        .bind(id)
        .fetch_optional(&mut **tx.conn())
        .await?
        .flatten();
        if delivered.as_deref() == Some(version) {
            sqlx::query("DELETE FROM _privacy_exports WHERE stream=? AND source_id=?")
                .bind(stream)
                .bind(id)
                .execute(&mut **tx.conn())
                .await?;
            sqlx::query(
                "UPDATE _privacy_export_sources SET pending=0 WHERE stream=? AND source_id=?",
            )
            .bind(stream)
            .bind(id)
            .execute(&mut **tx.conn())
            .await?;
            return tx.commit().await;
        }
        sqlx::query("INSERT INTO _privacy_exports(stream,source_id,source_version,timestamp,template_json,text_json) VALUES(?,?,?,?,?,?) ON CONFLICT(stream,source_id) DO UPDATE SET source_version=excluded.source_version,timestamp=excluded.timestamp,template_json=excluded.template_json,text_json=excluded.text_json WHERE source_version!=excluded.source_version")
            .bind(stream).bind(id).bind(version).bind(timestamp).bind(template.to_string()).bind(texts.to_string()).execute(&mut **tx.conn()).await?;
        sqlx::query("UPDATE _privacy_export_sources SET pending=0 WHERE stream=? AND source_id=?")
            .bind(stream)
            .bind(id)
            .execute(&mut **tx.conn())
            .await?;
        tx.commit().await
    }

    /// Called by the desktop adapter with its complete stored activity history.
    /// Repeated polls keep certified copies; edits and deletions revoke them.
    pub async fn stage_activity_exports(
        &self,
        rows: &[Value],
        cutoff: &str,
    ) -> Result<(), SqlxError> {
        let mut existing = self.activity_export_versions().await?;
        let delivered: Vec<(String,String)> = sqlx::query_as("SELECT source_id,delivered_version FROM _privacy_export_sources WHERE stream='activities' AND delivered_version IS NOT NULL").fetch_all(&self.pool).await?;
        for (id, version) in delivered {
            existing.entry(id).or_insert(version);
        }
        let mut ids = std::collections::HashSet::new();
        let cutoff =
            DateTime::parse_from_rfc3339(cutoff).map_err(|e| SqlxError::Protocol(e.to_string()))?;
        for row in rows {
            let id = row["activity_id"]
                .as_str()
                .ok_or_else(|| SqlxError::Protocol("activity ID missing".into()))?;
            let timestamp = row["end_at"]
                .as_str()
                .ok_or_else(|| SqlxError::Protocol("activity end missing".into()))?;
            let at = DateTime::parse_from_rfc3339(timestamp)
                .map_err(|e| SqlxError::Protocol(e.to_string()))?;
            if at < cutoff {
                continue;
            }
            ids.insert(id.to_string());
            let version = export_version(row)?;
            if existing.get(id) == Some(&version) {
                continue;
            }
            self.stage_derived_export("activities", id, &version, timestamp, row, None)
                .await?;
        }
        let removed = existing
            .keys()
            .filter(|id| !ids.contains(*id))
            .collect::<Vec<_>>();
        if removed.is_empty() {
            return Ok(());
        }
        let mut tx = self.begin_immediate_with_retry().await?;
        for id in removed {
            sqlx::query("DELETE FROM _privacy_exports WHERE stream='activities' AND source_id=?")
                .bind(id)
                .execute(&mut **tx.conn())
                .await?;
            sqlx::query(
                "DELETE FROM _privacy_export_sources WHERE stream='activities' AND source_id=?",
            )
            .bind(id)
            .execute(&mut **tx.conn())
            .await?;
        }
        tx.commit().await
    }

    /// Retain only a version marker after the transport checkpoint is durable.
    /// If cleanup is interrupted, the next tick retries from that checkpoint.
    pub async fn acknowledge_derived_exports(
        &self,
        stream: &str,
        sequence: i64,
    ) -> Result<(), SqlxError> {
        if !matches!(stream, "activities" | "parsed" | "feedback") {
            return Ok(());
        }
        let mut tx = self.begin_immediate_with_retry().await?;
        let rows:Vec<(i64,String,String)>=sqlx::query_as("SELECT s.id,s.source_id,s.source_version FROM _privacy_exports s JOIN _privacy_ready c ON c.kind='exports' AND c.id=CAST(s.id AS TEXT) JOIN _privacy_release r ON r.kind=c.kind AND r.id=c.id AND r.revision=c.revision AND r.policy=c.policy JOIN _privacy_policy p ON p.identity=c.policy WHERE s.stream=? AND c.sequence<=?")
            .bind(stream).bind(sequence).fetch_all(&mut **tx.conn()).await?;
        for (id, source_id, version) in rows {
            sqlx::query("INSERT INTO _privacy_export_sources(stream,source_id,pending,delivered_version) VALUES(?,?,0,?) ON CONFLICT(stream,source_id) DO UPDATE SET pending=0,delivered_version=excluded.delivered_version")
                .bind(stream).bind(source_id).bind(version).execute(&mut **tx.conn()).await?;
            sqlx::query("DELETE FROM _privacy_exports WHERE id=?")
                .bind(id)
                .execute(&mut **tx.conn())
                .await?;
        }
        tx.commit().await
    }

    pub async fn activity_export_versions(&self) -> Result<BTreeMap<String, String>, SqlxError> {
        let rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT source_id,source_version FROM _privacy_exports WHERE stream='activities'",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().collect())
    }

    /// The sync page budget bounds preparation, never accepted history. Source
    /// triggers retain edits; discovery and pending work resume across restarts.
    pub async fn prepare_derived_exports(
        &self,
        stream: &str,
        cutoff: &str,
        limit: u32,
    ) -> Result<bool, SqlxError> {
        let (table, predicate) = match stream {
            "parsed" => ("frames", "semantic_run_id IS NOT NULL"),
            "feedback" => ("feedback", "1"),
            _ => {
                return Err(SqlxError::Protocol(
                    "unsupported derived privacy stream".into(),
                ))
            }
        };
        let mut tx = self.begin_immediate_with_retry().await?;
        sqlx::query("INSERT OR IGNORE INTO _privacy_export_scan(stream) VALUES(?)")
            .bind(stream)
            .execute(&mut **tx.conn())
            .await?;
        let (after, complete): (i64, bool) =
            sqlx::query_as("SELECT after_id,complete FROM _privacy_export_scan WHERE stream=?")
                .bind(stream)
                .fetch_one(&mut **tx.conn())
                .await?;
        if !complete {
            let query = format!("SELECT rowid,CASE WHEN {predicate} THEN CAST(id AS TEXT) END FROM {table} WHERE rowid>? ORDER BY rowid LIMIT ?");
            let rows: Vec<(i64, Option<String>)> = sqlx::query_as(sqlx::AssertSqlSafe(query))
                .bind(after)
                .bind(limit)
                .fetch_all(&mut **tx.conn())
                .await?;
            for (_, id) in &rows {
                let Some(id) = id else { continue };
                sqlx::query(
                    "INSERT OR IGNORE INTO _privacy_export_sources(stream,source_id) VALUES(?,?)",
                )
                .bind(stream)
                .bind(id)
                .execute(&mut **tx.conn())
                .await?;
            }
            sqlx::query("UPDATE _privacy_export_scan SET after_id=?,complete=? WHERE stream=?")
                .bind(rows.last().map(|r| r.0).unwrap_or(after))
                .bind(rows.len() < limit as usize)
                .bind(stream)
                .execute(&mut **tx.conn())
                .await?;
        }
        tx.commit().await?;
        let pending: Vec<(String,i64)> = sqlx::query_as("SELECT source_id,version FROM _privacy_export_sources WHERE stream=? AND pending=1 ORDER BY source_id LIMIT ?").bind(stream).bind(limit).fetch_all(&self.pool).await?;
        let cutoff =
            DateTime::parse_from_rfc3339(cutoff).map_err(|e| SqlxError::Protocol(e.to_string()))?;
        for (id, version) in pending {
            let value = if stream == "parsed" {
                let context = self
                    .get_frame_semantic_context(
                        id.parse()
                            .map_err(|_| SqlxError::Protocol("invalid parsed frame ID".into()))?,
                    )
                    .await?;
                context.map(|context| {
                    let text = context.render_compact();
                    let mut value =
                        serde_json::to_value(context).expect("semantic context serializes");
                    value["text"] = Value::String(text);
                    value
                })
            } else {
                let rows = sqlx::query("SELECT id AS feedback_id,target_kind,target_id,NULLIF(target_version,'') AS target_version,producer_ref,actor_id,rating,comment,snapshot,context,created_at,updated_at FROM feedback WHERE id=?").bind(&id).fetch_all(&self.pool).await?;
                let mut values = Self::raw_sql_rows(&rows);
                if let Some(row) = values.as_array_mut().and_then(|v| v.pop()) {
                    let mut row = row;
                    for key in ["snapshot", "context"] {
                        if let Some(raw) = row[key].as_str() {
                            row[key] = serde_json::from_str(raw)
                                .map_err(|e| SqlxError::Protocol(e.to_string()))?;
                        }
                    }
                    Some(row)
                } else {
                    None
                }
            };
            if let Some(value) = value {
                let at = value[if stream == "parsed" {
                    "timestamp"
                } else {
                    "updated_at"
                }]
                .as_str()
                .ok_or_else(|| SqlxError::Protocol("export timestamp missing".into()))?;
                if DateTime::parse_from_rfc3339(at)
                    .map_err(|e| SqlxError::Protocol(e.to_string()))?
                    >= cutoff
                {
                    self.stage_derived_export(
                        stream,
                        &id,
                        &format!("{version}:{}", export_version(&value)?),
                        at,
                        &value,
                        Some(version),
                    )
                    .await?;
                    continue;
                }
            }
            let mut tx = self.begin_immediate_with_retry().await?;
            sqlx::query("UPDATE _privacy_export_sources SET pending=0 WHERE stream=? AND source_id=? AND version=?").bind(stream).bind(&id).bind(version).execute(&mut **tx.conn()).await?;
            tx.commit().await?;
        }
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM _privacy_export_sources WHERE stream=? AND pending=1) OR EXISTS(SELECT 1 FROM _privacy_export_scan WHERE stream=? AND complete=0)").bind(stream).bind(stream).fetch_one(&self.pool).await
    }

    pub(crate) async fn derived_release_page(
        &self,
        stream: &str,
        after: i64,
        cutoff: &str,
        limit: u32,
    ) -> Result<ReleasePage, SqlxError> {
        let sequence: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(sequence),?) FROM (SELECT sequence FROM _privacy_ready WHERE kind='exports' AND sequence>? ORDER BY sequence LIMIT ?)").bind(after).bind(after).bind(limit.min(500)).fetch_one(&self.pool).await?;
        let values: Vec<(String,String)> = sqlx::query_as("SELECT s.template_json,s.text_json FROM _privacy_ready c JOIN _privacy_release r ON r.kind=c.kind AND r.id=c.id AND r.revision=c.revision AND r.policy=c.policy JOIN _privacy_policy p ON p.identity=c.policy JOIN _privacy_exports s ON s.id=c.id WHERE c.kind='exports' AND c.sequence>? AND c.sequence<=? AND s.stream=? AND julianday(s.timestamp)>=julianday(?) ORDER BY c.sequence").bind(after).bind(sequence).bind(stream).bind(cutoff).fetch_all(&self.pool).await?;
        let mut rows = Vec::new();
        for (template, texts) in values {
            let mut row: Value =
                serde_json::from_str(&template).map_err(|e| SqlxError::Protocol(e.to_string()))?;
            let texts: BTreeMap<String, Value> =
                serde_json::from_str(&texts).map_err(|e| SqlxError::Protocol(e.to_string()))?;
            for (pointer, text) in texts {
                *row.pointer_mut(&pointer).ok_or_else(|| {
                    SqlxError::Protocol("invalid derived privacy pointer".into())
                })? = text;
            }
            rows.push(row);
        }
        let more = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM _privacy_ready WHERE kind='exports' AND sequence>?)",
        )
        .bind(sequence)
        .fetch_one(&self.pool)
        .await?;
        Ok(ReleasePage {
            sequence,
            more,
            rows: json!(rows),
        })
    }
}
