use std::path::Path;

use crate::DatabaseManager;

impl DatabaseManager {
    pub async fn get_total_frames(&self, video_path: &Path) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM frames JOIN video_chunks ON frames.video_chunk_id = video_chunks.id WHERE video_chunks.file_path = ?1",
        )
        .bind(video_path.to_str().unwrap())
        .fetch_one(&self.pool)
        .await
    }
    /// Retrieves a list of videos ordered by their start time.
    pub async fn get_ordered_videos(&self) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar(
            r#"
            SELECT file_path
            FROM video_chunks
            ORDER BY id ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await
    }

    /// Retrieves the next video after the given video_path.
    pub async fn get_next_video(
        &self,
        current_video_path: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(
            r#"
            SELECT file_path
            FROM video_chunks
            WHERE id > (SELECT id FROM video_chunks WHERE file_path = ?1)
            ORDER BY id ASC
            LIMIT 1
            "#,
        )
        .bind(current_video_path)
        .fetch_optional(&self.pool)
        .await
    }
}
