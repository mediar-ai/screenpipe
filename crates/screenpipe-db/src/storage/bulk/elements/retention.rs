// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Retention owns complete frame trees. Apply their shadow/index mutations as
//! sets, under the caller's existing transaction. Re-entering SQLite once per
//! element through xUpdate repeatedly creates statement journals and FTS
//! savepoints, holding the recording writer even for a single large frame.

use super::{names, TABLE};
use crate::storage::storage_error;
use sqlx::SqliteConnection;

/// Preserve xUpdate's identities, generations, relationships, search postings,
/// accounting and revocation. Payloads stream through SQLite's existing
/// disk-backed staging table rather than accumulating a second Rust tree.
pub(crate) async fn mutate(
    conn: &mut SqliteConnection,
    frame_ids: &[i64],
    new_frame: Option<i64>,
) -> Result<(), sqlx::Error> {
    let ids = serde_json::to_string(frame_ids).map_err(storage_error)?;
    let selected = "frame_id IN (SELECT value FROM json_each(?1))";
    let present: bool = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT EXISTS(SELECT 1 FROM elements WHERE {selected})"
    )))
    .bind(&ids)
    .fetch_one(&mut *conn)
    .await?;
    if !present {
        return Ok(());
    }
    let resident: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT COALESCE(SUM({}),0) FROM _bulk_element_rows WHERE _archive_deleted=0 AND {selected}",
        TABLE.all_bytes("")
    )))
    .bind(&ids)
    .fetch_one(&mut *conn)
    .await?;
    // Existing staged overrides win. Archived records retain their original
    // IDs/generations and file locators until the atomic mutation below.
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT OR IGNORE INTO _bulk_element_rows(id,_archive_generation,_archive_deleted,_archive_file,{columns})
         SELECT e.id,e._archive_generation,0,
         (SELECT file_id FROM _bulk_element_ranges WHERE first_id=(SELECT max(first_id) FROM _bulk_element_ranges WHERE first_id<=e.id) AND last_id>=e.id),{columns}
         FROM elements e WHERE {selected}",
        columns=names(),
    )))
    .bind(&ids)
    .execute(&mut *conn)
    .await?;

    if new_frame.is_none() {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO elements_fts(elements_fts,rowid,text,role,frame_id)
         SELECT 'delete',id,text,role,frame_id FROM _bulk_element_rows
         WHERE {selected} AND _archive_deleted=0 AND text IS NOT NULL AND text!=''"
        )))
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
    }
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "UPDATE _bulk_files SET state='dirty' WHERE id IN
         (SELECT _archive_file FROM _bulk_element_rows WHERE {selected} AND _archive_deleted=0)"
    )))
    .bind(&ids)
    .execute(&mut *conn)
    .await?;

    let staged = if let Some(target) = new_frame {
        // Move the existing records, including their parent IDs. Nothing is
        // copied under a new identity or exposed before the transaction commits.
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO _bulk_element_groups
             SELECT {target},kind_id,visibility,is_null,SUM(rows) FROM _bulk_element_groups
             WHERE {selected} GROUP BY kind_id,visibility,is_null
             ON CONFLICT(frame_id,kind_id,visibility,is_null) DO UPDATE SET rows=rows+excluded.rows"
        )))
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM _bulk_element_groups WHERE {selected}"
        )))
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
        let bytes: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT COALESCE(SUM({}),0) FROM _bulk_element_rows WHERE {selected} AND _archive_deleted=0",
            TABLE.all_bytes("")
        )))
        .bind(&ids)
        .fetch_one(&mut *conn)
        .await?;
        // frame_id is UNINDEXED in the external-content FTS table. Text/role
        // and row IDs are unchanged; its content view resolves the new owner.
        // Rebuilding identical postings would hold the writer unnecessarily.
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "UPDATE _bulk_element_rows SET frame_id={target},_archive_generation=_archive_generation+1
             WHERE {selected} AND _archive_deleted=0"
        )))
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
        bytes
    } else {
        // Keep the same parent-FK rule as a complete xUpdate tree deletion:
        // children outside the selected trees may not lose their parent.
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "WITH removed AS MATERIALIZED (
                SELECT parent_id,count(*) AS n FROM _bulk_element_rows
                WHERE {selected} AND _archive_deleted=0 AND parent_id IS NOT NULL GROUP BY parent_id
             ) UPDATE _bulk_element_parent_refs AS p SET rows=p.rows-removed.n
               FROM removed WHERE p.parent_id=removed.parent_id"
        )))
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
        let dangling: Option<(i64, i64)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT p.parent_id,p.rows FROM _bulk_element_parent_refs p
             JOIN _bulk_element_rows e ON e.id=p.parent_id
             WHERE e.{selected} AND e._archive_deleted=0 AND p.rows>0"
        )))
        .bind(&ids)
        .fetch_optional(&mut *conn)
        .await?;
        if let Some((parent, references)) = dangling {
            return Err(storage_error(format!(
                "element parent is absent; retention tree remains pending (parent_id={parent}, retained_references={references})"
            )));
        }
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM _bulk_element_parent_refs WHERE rows=0 AND parent_id IN
             (SELECT parent_id FROM _bulk_element_rows WHERE {selected} AND _archive_deleted=0 AND parent_id IS NOT NULL)"
        )))
            .bind(&ids)
            .execute(&mut *conn)
            .await?;
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM _bulk_element_groups WHERE {selected}"
        )))
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
        let cleared = TABLE
            .columns
            .iter()
            .map(|c| format!("{}=NULL", c.name))
            .collect::<Vec<_>>()
            .join(",");
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "UPDATE _bulk_element_rows SET {cleared},_archive_generation=_archive_generation+1,_archive_deleted=1
             WHERE {selected} AND _archive_deleted=0"
        )))
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
        0
    };
    // Shadow-row hooks maintain the resident lookup. Logical changes also
    // revoke already-prepared exports, including first-generation archives.
    sqlx::query(
        "UPDATE storage_metadata SET staging_bytes=staging_bytes-?1+?2,revision=revision+1",
    )
    .bind(resident)
    .bind(staged)
    .execute(&mut *conn)
    .await?;
    sqlx::query("UPDATE _bulk_element_state SET version=version+1")
        .execute(&mut *conn)
        .await?;
    sqlx::query("UPDATE _storage_revocation SET revision=revision+1")
        .execute(&mut *conn)
        .await?;
    sqlx::query(
        "UPDATE _storage_revocation_cause SET cause='hybrid_read_revoke_element' WHERE id=1",
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
