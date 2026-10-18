// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Resident read indexes and response revocation, installed through the
//! existing writer during startup. Older hybrid generations upgrade in place.

use super::{storage_error, HybridStorage};
use sqlx::{Connection, Row, SqliteConnection};

const REVOCATION: &str = r#"
CREATE TABLE IF NOT EXISTS _storage_revocation(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
INSERT OR IGNORE INTO _storage_revocation VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS hybrid_read_revoke_policy AFTER UPDATE OF policy,required_surfaces ON storage_metadata
WHEN NEW.policy IS NOT OLD.policy OR NEW.required_surfaces IS NOT OLD.required_surfaces
BEGIN UPDATE _storage_revocation SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS hybrid_read_revoke_payload AFTER UPDATE OF generation ON frame_payloads
WHEN (SELECT maintenance FROM storage_metadata)=1 AND NEW.generation!=OLD.generation
AND (NEW.completed_surfaces!=0 OR NEW.policy IS NOT OLD.policy)
BEGIN UPDATE _storage_revocation SET revision=revision+1; END;
"#;

const LOOKUP: &str = r#"
CREATE TABLE IF NOT EXISTS _bulk_element_lookup(id INTEGER PRIMARY KEY,frame_id INTEGER NOT NULL,sort_order INTEGER,kind_id INTEGER NOT NULL,on_screen INTEGER);
CREATE VIEW IF NOT EXISTS _bulk_element_search AS SELECT e.id,e.frame_id,e.sort_order,e.on_screen,k.source,k.role FROM _bulk_element_lookup e JOIN _bulk_element_kinds k ON k.id=e.kind_id;
CREATE TABLE IF NOT EXISTS _storage_read_upgrade(id INTEGER PRIMARY KEY CHECK(id=1),last_id INTEGER);
INSERT OR IGNORE INTO _storage_read_upgrade VALUES(1,NULL);
CREATE TRIGGER IF NOT EXISTS hybrid_read_revoke_element AFTER INSERT ON _bulk_element_rows
WHEN NEW._archive_generation>1
BEGIN UPDATE _storage_revocation SET revision=revision+1; END;
"#;

pub(crate) async fn upgrade(
    conn: &mut SqliteConnection,
    storage: &HybridStorage,
) -> Result<bool, sqlx::Error> {
    use sha2::{Digest, Sha256};
    let checksum = format!(
        "{:x}",
        Sha256::digest(format!(
            "{REVOCATION}{LOOKUP}:resident-delete-and-redacted-update-v1"
        ))
    );
    let installed: Option<String> =
        sqlx::query_scalar("SELECT checksum FROM _hybrid_migrations WHERE version=3")
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(installed) = installed {
        return if installed == checksum {
            upgrade_export_revocation(conn).await
        } else {
            Err(storage_error("read schema checksum mismatch"))
        };
    }
    let mut tx = conn.begin().await?;
    sqlx::raw_sql(REVOCATION).execute(&mut *tx).await?;
    // Every resident logical deletion revokes a prepared response. Privacy
    // updates also revoke when the redaction marker was already populated.
    let tables: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_list WHERE schema='main' AND type='table' AND substr(name,1,1)!='_' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sqlite_sequence','storage_metadata','payload_files','frame_payloads','upload_bindings')")
        .fetch_all(&mut *tx).await?;
    for table in tables {
        install_resident_hooks(&mut tx, &table).await?;
    }
    if storage.has_bulk() {
        sqlx::raw_sql(LOOKUP).execute(&mut *tx).await?;
        for event in ["INSERT", "UPDATE"] {
            sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                "CREATE TRIGGER IF NOT EXISTS hybrid_read_element_lookup_{event} AFTER {event} ON _bulk_element_rows BEGIN
                 DELETE FROM _bulk_element_lookup WHERE id=NEW.id;
                 INSERT INTO _bulk_element_lookup SELECT NEW.id,NEW.frame_id,NEW.sort_order,k.id,NEW.on_screen FROM _bulk_element_kinds k WHERE k.source=NEW.source AND k.role=NEW.role AND NEW._archive_deleted=0;
                 END;"
            ))).execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;
    if storage.has_bulk() {
        loop {
            let after: Option<i64> =
                sqlx::query_scalar("SELECT last_id FROM _storage_read_upgrade WHERE id=1")
                    .fetch_one(&mut *conn)
                    .await?;
            // Only the compact metadata columns are decoded, never text or
            // geometry. Primary-key windows bound memory and WAL on large DBs.
            let lower = after.map_or_else(|| "1".to_owned(), |id| format!("e.id>{id}"));
            let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
                "SELECT e.id,e.frame_id,e.sort_order,k.id AS kind_id,e.on_screen FROM elements e CROSS JOIN _bulk_element_kinds k WHERE {lower} AND k.source=e.source AND k.role=e.role ORDER BY e.id LIMIT 4096"
            ))).fetch_all(&mut *conn).await?;
            if rows.is_empty() {
                break;
            }
            let last: i64 = rows.last().unwrap().try_get("id")?;
            let mut tx = conn.begin().await?;
            let mut insert = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
                "INSERT OR REPLACE INTO _bulk_element_lookup ",
            );
            insert.push_values(&rows, |mut row, value| {
                row.push_bind(value.get::<i64, _>("id"))
                    .push_bind(value.get::<i64, _>("frame_id"))
                    .push_bind(value.get::<Option<i64>, _>("sort_order"))
                    .push_bind(value.get::<i64, _>("kind_id"))
                    .push_bind(value.get::<Option<i64>, _>("on_screen"));
            });
            insert.build().execute(&mut *tx).await?;
            sqlx::query("UPDATE _storage_read_upgrade SET last_id=? WHERE id=1")
                .bind(last)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
            super::schema::construction_checkpoint(conn).await?;
            tracing::info!(
                last_element_id = last,
                "building Parquet element lookup index"
            );
        }
    }
    let mut tx = conn.begin().await?;
    sqlx::query("INSERT INTO _hybrid_migrations VALUES(3,?)")
        .bind(checksum)
        .execute(&mut *tx)
        .await?;
    if storage.has_bulk() {
        sqlx::query("DROP TABLE _storage_read_upgrade")
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    upgrade_export_revocation(conn).await
}

/// Preserve v3's recorded identity, but upgrade installed hooks atomically.
/// Snapshot compaction moves the same image into a video. All other updates,
/// deletions and privacy-policy changes retain their existing revocation rules.
async fn upgrade_export_revocation(conn: &mut SqliteConnection) -> Result<bool, sqlx::Error> {
    const IDENTITY: &str = "export-revocation-causes-and-frame-locators-v7";
    let installed: Option<String> =
        sqlx::query_scalar("SELECT checksum FROM _hybrid_migrations WHERE version=7")
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(installed) = installed {
        return if installed == IDENTITY {
            Ok(false)
        } else {
            Err(storage_error("export revocation schema checksum mismatch"))
        };
    }
    let mut tx = conn.begin().await?;
    sqlx::raw_sql("CREATE TABLE IF NOT EXISTS _storage_revocation_cause(id INTEGER PRIMARY KEY CHECK(id=1),cause TEXT NOT NULL); INSERT OR IGNORE INTO _storage_revocation_cause VALUES(1,'unknown_before_upgrade');")
        .execute(&mut *tx).await?;
    let columns: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info('frames')")
        .fetch_all(&mut *tx)
        .await?;
    const MEDIA: [&str; 3] = ["video_chunk_id", "offset_index", "snapshot_path"];
    let content_updates = columns
        .iter()
        .filter(|column| !MEDIA.contains(&column.as_str()))
        .map(|column| format!("\"{}\"", column.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(",");
    let hooks: Vec<(String, String)> = sqlx::query_as(
        "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name GLOB 'hybrid_read_revoke_*'",
    ).fetch_all(&mut *tx).await?;
    for (name, sql) in hooks {
        let sql = if sql.contains("UPDATE _storage_revocation_cause") {
            sql
        } else {
            sql.replace(
                "UPDATE _storage_revocation SET revision=revision+1;",
                &revocation(&name, true),
            )
        };
        let sql = if name == "hybrid_read_revoke_redaction_frames"
            && !sql.contains("AFTER UPDATE OF")
        {
            // UPDATE OF matters: a repeated image watermark in the same second
            // still revokes, even if a statement also relocates its media.
            let content = sql.replace(
                "AFTER UPDATE ON",
                &format!("AFTER UPDATE OF {content_updates} ON"),
            );
            let media_name = "hybrid_read_revoke_media_frames";
            let media = sql.replace(&name, media_name)
                .replace("AFTER UPDATE ON", &format!("AFTER UPDATE OF {} ON", MEDIA.join(",")))
                .replace(" BEGIN ", " AND NOT (OLD.snapshot_path IS NOT NULL AND NEW.snapshot_path IS NULL AND NEW.video_chunk_id IS NOT NULL AND OLD.video_chunk_id IS NOT NEW.video_chunk_id) BEGIN ");
            format!("{content}; {media}")
        } else {
            sql
        };
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "DROP TRIGGER \"{}\"; {sql}",
            name.replace('"', "\"\"")
        )))
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query("INSERT INTO _hybrid_migrations VALUES(7,?)")
        .bind(IDENTITY)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(true)
}

fn revocation(trigger: &str, with_cause: bool) -> String {
    let cause = if with_cause {
        format!(
            " UPDATE _storage_revocation_cause SET cause='{}' WHERE id=1;",
            trigger.replace('\'', "''")
        )
    } else {
        String::new()
    };
    format!("UPDATE _storage_revocation SET revision=revision+1;{cause}")
}

// Shared by initial conversion and tables introduced by later SQLx migrations.
pub(super) async fn install_resident_hooks(
    conn: &mut SqliteConnection,
    table: &str,
) -> Result<(), sqlx::Error> {
    let columns: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info(?)")
        .bind(table)
        .fetch_all(&mut *conn)
        .await?;
    let escaped = table.replace('"', "\"\"");
    let quoted = format!("\"{escaped}\"");
    let with_cause: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='_storage_revocation_cause')",
    )
    .fetch_one(&mut *conn)
    .await?;
    let deletion = revocation(&format!("hybrid_read_revoke_delete_{table}"), with_cause);
    sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "CREATE TRIGGER IF NOT EXISTS \"hybrid_read_revoke_delete_{escaped}\" AFTER DELETE ON {quoted} BEGIN {deletion} END;"
        ))).execute(&mut *conn).await?;
    let redacted = columns
        .iter()
        .filter(|c| c.ends_with("redacted_at"))
        .map(|c| format!("OLD.\"{c}\" IS NOT NULL OR NEW.\"{c}\" IS NOT NULL"))
        .collect::<Vec<_>>()
        .join(" OR ");
    if !redacted.is_empty() {
        let update = revocation(&format!("hybrid_read_revoke_redaction_{table}"), with_cause);
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                "CREATE TRIGGER IF NOT EXISTS \"hybrid_read_revoke_redaction_{escaped}\" AFTER UPDATE ON {quoted} WHEN (SELECT maintenance=0 FROM storage_metadata) AND ({redacted}) BEGIN {update} END;"
            ))).execute(&mut *conn).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DatabaseManager;

    #[tokio::test]
    async fn existing_revocation_hooks_upgrade_atomically_and_survive_reopen() {
        let root = tempfile::tempdir().unwrap();
        let db = DatabaseManager::new_hybrid(root.path(), Default::default(), Default::default())
            .await
            .unwrap();
        let identities: Vec<(i64, String)> = sqlx::query_as(
            "SELECT version,checksum FROM _hybrid_migrations WHERE version<7 ORDER BY version",
        )
        .fetch_all(&db.pool)
        .await
        .unwrap();
        // Restore the installed pre-v7 hooks, including the unconditional
        // redacted-frame update hook. No stored recordings are rewritten.
        let mut tx = db.begin_immediate_with_retry().await.unwrap();
        let hooks: Vec<(String, String)> = sqlx::query_as(
            "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name GLOB 'hybrid_read_revoke_*'"
        ).fetch_all(&mut **tx.conn()).await.unwrap();
        for (name, sql) in hooks {
            sqlx::raw_sql(sqlx::AssertSqlSafe(format!("DROP TRIGGER \"{name}\"")))
                .execute(&mut **tx.conn())
                .await
                .unwrap();
            if name == "hybrid_read_revoke_media_frames" {
                continue;
            }
            let mut sql = sql.replace(&revocation(&name, true), &revocation(&name, false));
            if name == "hybrid_read_revoke_redaction_frames" {
                let start = sql.find("AFTER UPDATE OF").unwrap();
                let end = start + sql[start..].find(" ON ").unwrap();
                sql.replace_range(start..end, "AFTER UPDATE");
            }
            sqlx::raw_sql(sqlx::AssertSqlSafe(sql))
                .execute(&mut **tx.conn())
                .await
                .unwrap();
        }
        sqlx::raw_sql(
            "DROP TABLE _storage_revocation_cause; DELETE FROM _hybrid_migrations WHERE version=7;",
        )
        .execute(&mut **tx.conn())
        .await
        .unwrap();
        tx.commit().await.unwrap();
        db.execute_raw_sql_write("INSERT INTO frames(id,timestamp,full_text,snapshot_path) VALUES(1,'2026-10-16','retained','redacted.jpg'); UPDATE frames SET image_redacted_at=1 WHERE id=1;").await.unwrap();
        db.close().await;
        for reopen in 0..2 {
            let db = DatabaseManager::new(
                root.path().join("db.sqlite").to_str().unwrap(),
                Default::default(),
            )
            .await
            .unwrap();
            assert_eq!(identities, sqlx::query_as::<_,(i64,String)>(
                "SELECT version,checksum FROM _hybrid_migrations WHERE version<7 ORDER BY version"
            ).fetch_all(&db.pool).await.unwrap());
            let export = db.storage_export_token().await.unwrap();
            if reopen == 0 {
                let chunk = db
                    .insert_video_chunk_with_fps("compacted.mp4", "test", 1.0)
                    .await
                    .unwrap();
                db.compact_snapshots_queued(chunk, vec![(1, 0)])
                    .await
                    .unwrap();
                drop(export.admit(&db.pool).await.unwrap());
            } else {
                db.execute_raw_sql_write("UPDATE frames SET image_redacted_at=1 WHERE id=1")
                    .await
                    .unwrap();
                let error = export.admit(&db.pool).await.unwrap_err().to_string();
                assert!(
                    error.contains("cause=hybrid_read_revoke_redaction_frames"),
                    "{error}"
                );
            }
            assert_eq!(
                db.frame_payloads(&[1], super::super::Projection::All)
                    .await
                    .unwrap()[&1]
                    .full_text
                    .as_deref(),
                Some("retained")
            );
            drop(export);
            db.close().await;
        }
    }
}
