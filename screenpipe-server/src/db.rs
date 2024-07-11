use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqlitePool, SqlitePoolOptions},
    FromRow,
};
use std::time::Duration;

#[derive(Debug, Serialize)]
pub enum SearchResult {
    OCR(OCRResult),
    Audio(AudioResult),
}

#[derive(Debug, Serialize, FromRow)]
pub struct OCRResult {
    pub frame_id: i64,
    pub ocr_text: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
}

#[derive(Debug, Deserialize, PartialEq, Default, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    #[default]
    All,
    OCR,
    Audio,
}

#[derive(Debug, Serialize, FromRow)]
pub struct AudioResult {
    pub audio_chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
}

pub struct DatabaseManager {
    pool: SqlitePool,
}

impl DatabaseManager {
    pub async fn new(database_path: &str) -> Result<Self, sqlx::Error> {
        let connection_string = format!("{}?mode=rwc", database_path);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(3))
            .connect(&connection_string)
            .await?;
        let db_manager = DatabaseManager { pool };
        db_manager.create_tables().await?;
        Ok(db_manager)
    }

    pub async fn insert_audio_chunk(&self, file_path: &str) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let id = sqlx::query("INSERT INTO audio_chunks (file_path) VALUES (?1)")
            .bind(file_path)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();
        tx.commit().await?;
        Ok(id)
    }

    pub async fn insert_audio_transcription(
        &self,
        audio_chunk_id: i64,
        transcription: &str,
        offset_index: i64,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO audio_transcriptions (audio_chunk_id, transcription, offset_index, timestamp) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(audio_chunk_id)
        .bind(transcription)
        .bind(offset_index)
        .bind(Utc::now())
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn create_tables(&self) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS video_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL
        )",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS frames (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_chunk_id INTEGER NOT NULL,
            offset_index INTEGER NOT NULL,
            timestamp TIMESTAMP NOT NULL
        )",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS ocr_text (
            frame_id INTEGER NOT NULL,
            text TEXT NOT NULL
        )",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS audio_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL
            )",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS audio_transcriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                audio_chunk_id INTEGER NOT NULL,
                offset_index INTEGER NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                transcription TEXT NOT NULL,
                FOREIGN KEY (audio_chunk_id) REFERENCES audio_chunks(id)
            )",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        self.create_indices().await?;

        Ok(())
    }

    pub async fn purge(&mut self) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        sqlx::query("DROP TABLE IF EXISTS video_chunks")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DROP TABLE IF EXISTS frames")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DROP TABLE IF EXISTS ocr_text")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DROP TABLE IF EXISTS audio_chunks")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DROP TABLE IF EXISTS audio_transcriptions")
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        self.create_tables().await?;
        Ok(())
    }

    async fn create_indices(&self) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_video_chunk_id_id ON frames (        video_chunk_id, id)",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_frame_id ON ocr_text (frame_id)")
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_audio_chunk_id ON audio_transcriptions (audio_chunk_id)",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn insert_video_chunk(&self, file_path: &str) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let id = sqlx::query("INSERT INTO video_chunks (file_path) VALUES (?1)")
            .bind(file_path)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();
        tx.commit().await?;
        Ok(id)
    }

    pub async fn insert_frame(&self) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // Get the most recent video_chunk_id
        let video_chunk_id: Option<i64> =
            sqlx::query_scalar("SELECT id FROM video_chunks ORDER BY id DESC LIMIT 1")
                .fetch_optional(&mut *tx)
                .await?;

        // If no video chunk is found, return 0
        let video_chunk_id = match video_chunk_id {
            Some(id) => id,
            None => {
                tx.rollback().await?;
                return Ok(0);
            }
        };

        // ... rest of the function remains the same
        let offset_index: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(offset_index), -1) + 1 FROM frames WHERE video_chunk_id = ?1",
        )
        .bind(video_chunk_id)
        .fetch_one(&mut *tx)
        .await?;

        let id = sqlx::query(
            "INSERT INTO frames (video_chunk_id, offset_index, timestamp) VALUES (?1, ?2, ?3)",
        )
        .bind(video_chunk_id)
        .bind(offset_index)
        .bind(Utc::now())
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        tx.commit().await?;
        Ok(id)
    }

    pub async fn insert_ocr_text(&self, frame_id: i64, text: &str) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO ocr_text (frame_id, text) VALUES (?1, ?2)")
            .bind(frame_id)
            .bind(text)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn search(
        &self,
        query: &str,
        content_type: ContentType,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<SearchResult>, sqlx::Error> {
        let mut results = Vec::new();

        if content_type == ContentType::All || content_type == ContentType::OCR {
            let ocr_results = self.search_ocr(query, limit, offset).await?;
            results.extend(ocr_results.into_iter().map(SearchResult::OCR));
        }

        if content_type == ContentType::All || content_type == ContentType::Audio {
            let audio_results = self.search_audio(query, limit, offset).await?;
            results.extend(audio_results.into_iter().map(SearchResult::Audio));
        }

        Ok(results)
    }

    async fn search_ocr(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<OCRResult>, sqlx::Error> {
        sqlx::query_as::<_, OCRResult>(
            r#"
            SELECT 
                ocr_text.frame_id,
                ocr_text.text as ocr_text,
                frames.timestamp,
                video_chunks.file_path,
                frames.offset_index
            FROM 
                ocr_text
            JOIN 
                frames ON ocr_text.frame_id = frames.id
            JOIN 
                video_chunks ON frames.video_chunk_id = video_chunks.id
            WHERE 
                ocr_text.text LIKE '%' || ?1 || '%'
            ORDER BY 
                frames.timestamp DESC
            LIMIT ?2 OFFSET ?3
            "#,
        )
        .bind(query)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    async fn search_audio(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<AudioResult>, sqlx::Error> {
        sqlx::query_as::<_, AudioResult>(
            r#"
            SELECT 
                audio_transcriptions.audio_chunk_id,
                audio_transcriptions.transcription,
                audio_transcriptions.timestamp,
                audio_chunks.file_path,
                audio_transcriptions.offset_index
            FROM 
                audio_transcriptions
            JOIN 
                audio_chunks ON audio_transcriptions.audio_chunk_id = audio_chunks.id
            WHERE 
                audio_transcriptions.transcription LIKE '%' || ?1 || '%'
            ORDER BY 
                audio_transcriptions.timestamp DESC
            LIMIT ?2 OFFSET ?3
            "#,
        )
        .bind(query)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn get_frame(&self, frame_id: i64) -> Result<Option<(String, i64)>, sqlx::Error> {
        sqlx::query_as::<_, (String, i64)>(
            r#"
            SELECT 
                video_chunks.file_path,
                frames.offset_index
            FROM 
                frames
            JOIN 
                video_chunks ON frames.video_chunk_id = video_chunks.id
            WHERE 
                frames.id = ?1
            "#,
        )
        .bind(frame_id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn get_recent_results(
        &self,
        limit: u32,
        offset: u32,
        start_timestamp: Option<DateTime<Utc>>,
        end_timestamp: Option<DateTime<Utc>>,
    ) -> Result<Vec<SearchResult>, sqlx::Error> {
        let mut results = Vec::new();

        let ocr_query = r#"
            SELECT 
                ocr_text.frame_id,
                ocr_text.text as ocr_text,
                frames.timestamp,
                video_chunks.file_path,
                frames.offset_index
            FROM 
                ocr_text
            JOIN 
                frames ON ocr_text.frame_id = frames.id
            JOIN 
                video_chunks ON frames.video_chunk_id = video_chunks.id
            WHERE 
                1=1
                AND (?1 IS NULL OR frames.timestamp >= ?1)
                AND (?2 IS NULL OR frames.timestamp <= ?2)
            ORDER BY 
                frames.timestamp DESC
            LIMIT ?3 OFFSET ?4
        "#;

        let ocr_results = sqlx::query_as::<_, OCRResult>(ocr_query)
            .bind(start_timestamp)
            .bind(end_timestamp)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

        results.extend(ocr_results.into_iter().map(SearchResult::OCR));

        let audio_query = r#"
            SELECT 
                audio_transcriptions.audio_chunk_id,
                audio_transcriptions.transcription,
                audio_transcriptions.timestamp,
                audio_chunks.file_path,
                audio_transcriptions.offset_index
            FROM 
                audio_transcriptions
            JOIN 
                audio_chunks ON audio_transcriptions.audio_chunk_id = audio_chunks.id
            WHERE 
                1=1
                AND (?1 IS NULL OR audio_transcriptions.timestamp >= ?1)
                AND (?2 IS NULL OR audio_transcriptions.timestamp <= ?2)
            ORDER BY 
                audio_transcriptions.timestamp DESC
            LIMIT ?3 OFFSET ?4
        "#;

        let audio_results = sqlx::query_as::<_, AudioResult>(audio_query)
            .bind(start_timestamp)
            .bind(end_timestamp)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

        results.extend(audio_results.into_iter().map(SearchResult::Audio));

        // Sort combined results by timestamp
        results.sort_by(|a, b| {
            let timestamp_a = match a {
                SearchResult::OCR(ocr) => ocr.timestamp,
                SearchResult::Audio(audio) => audio.timestamp,
            };
            let timestamp_b = match b {
                SearchResult::OCR(ocr) => ocr.timestamp,
                SearchResult::Audio(audio) => audio.timestamp,
            };
            timestamp_b.cmp(&timestamp_a)
        });

        // Limit the final combined results
        results.truncate(limit as usize);

        Ok(results)
    }
    pub async fn count_search_results(
        &self,
        query: &str,
        content_type: ContentType,
    ) -> Result<usize, sqlx::Error> {
        let mut total_count = 0;

        if content_type == ContentType::All || content_type == ContentType::OCR {
            let ocr_count: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM ocr_text WHERE text LIKE '%' || ?1 || '%'")
                    .bind(query)
                    .fetch_one(&self.pool)
                    .await?;
            total_count += ocr_count.0 as usize;
        }

        if content_type == ContentType::All || content_type == ContentType::Audio {
            let audio_count: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM audio_transcriptions WHERE transcription LIKE '%' || ?1 || '%'"
            )
            .bind(query)
            .fetch_one(&self.pool)
            .await?;
            total_count += audio_count.0 as usize;
        }

        Ok(total_count)
    }
    pub async fn count_recent_results(
        &self,
        start_timestamp: Option<DateTime<Utc>>,
        end_timestamp: Option<DateTime<Utc>>,
    ) -> Result<usize, sqlx::Error> {
        let mut total_count = 0;

        let ocr_count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM frames
            JOIN ocr_text ON frames.id = ocr_text.frame_id
            WHERE 
                (?1 IS NULL OR frames.timestamp >= ?1)
                AND (?2 IS NULL OR frames.timestamp <= ?2)
            "#,
        )
        .bind(start_timestamp)
        .bind(end_timestamp)
        .fetch_one(&self.pool)
        .await?;

        total_count += ocr_count.0 as usize;

        let audio_count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM audio_transcriptions
            WHERE 
                (?1 IS NULL OR timestamp >= ?1)
                AND (?2 IS NULL OR timestamp <= ?2)
            "#,
        )
        .bind(start_timestamp)
        .bind(end_timestamp)
        .fetch_one(&self.pool)
        .await?;

        total_count += audio_count.0 as usize;

        Ok(total_count)
    }
}

impl Clone for DatabaseManager {
    fn clone(&self) -> Self {
        DatabaseManager {
            pool: self.pool.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_test_db() -> DatabaseManager {
        DatabaseManager::new("sqlite::memory:").await.unwrap()
    }

    #[tokio::test]
    async fn test_insert_and_search_ocr() {
        let db = setup_test_db().await;
        let video_chunk_id = db.insert_video_chunk("test_video.mp4").await.unwrap();
        let frame_id = db.insert_frame().await.unwrap();
        db.insert_ocr_text(frame_id, "Hello, world!").await.unwrap();

        let results = db.search("Hello", ContentType::OCR, 100, 0).await.unwrap();
        assert_eq!(results.len(), 1);
        if let SearchResult::OCR(ocr_result) = &results[0] {
            assert_eq!(ocr_result.ocr_text, "Hello, world!");
            assert_eq!(ocr_result.file_path, "test_video.mp4");
        } else {
            panic!("Expected OCR result");
        }
    }

    #[tokio::test]
    async fn test_insert_and_search_audio() {
        let db = setup_test_db().await;
        let audio_chunk_id = db.insert_audio_chunk("test_audio.mp3").await.unwrap();
        db.insert_audio_transcription(audio_chunk_id, "Hello from audio", 0)
            .await
            .unwrap();

        let results = db
            .search("audio", ContentType::Audio, 100, 0)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        if let SearchResult::Audio(audio_result) = &results[0] {
            assert_eq!(audio_result.transcription, "Hello from audio");
            assert_eq!(audio_result.file_path, "test_audio.mp3");
        } else {
            panic!("Expected Audio result");
        }
    }

    #[tokio::test]
    async fn test_search_all() {
        let db = setup_test_db().await;

        // Insert OCR data
        let video_chunk_id = db.insert_video_chunk("test_video.mp4").await.unwrap();
        let frame_id = db.insert_frame().await.unwrap();
        db.insert_ocr_text(frame_id, "Hello from OCR")
            .await
            .unwrap();

        // Insert Audio data
        let audio_chunk_id = db.insert_audio_chunk("test_audio.mp3").await.unwrap();
        db.insert_audio_transcription(audio_chunk_id, "Hello from audio", 0)
            .await
            .unwrap();

        let results = db.search("Hello", ContentType::All, 100, 0).await.unwrap();
        assert_eq!(results.len(), 2);

        let ocr_count = results
            .iter()
            .filter(|r| matches!(r, SearchResult::OCR(_)))
            .count();
        let audio_count = results
            .iter()
            .filter(|r| matches!(r, SearchResult::Audio(_)))
            .count();

        assert_eq!(ocr_count, 1);
        assert_eq!(audio_count, 1);
    }
}
