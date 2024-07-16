use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use sqlx::migrate::MigrateDatabase;
use sqlx::Sqlite;
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

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TagContentType {
    Vision,
    Audio,
}

#[derive(Debug, Serialize, FromRow)]
pub struct OCRResult {
    pub frame_id: i64,
    pub ocr_text: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    #[sqlx(rename = "tags_json")]
    pub tags_json: Option<String>,
    #[serde(skip)]
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct AudioResult {
    pub audio_chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub tags: StringVec,
}
pub struct StringVec(pub Vec<String>);

impl<'r> sqlx::decode::Decode<'r, sqlx::Sqlite> for StringVec {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'r>) -> Result<Self, sqlx::Error> {
        let value = value.as_str()?;
        let tags: Vec<String> = serde_json::from_str(value)?;
        Ok(StringVec(tags))
    }
}
#[derive(Debug, Deserialize, PartialEq, Default, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    #[default]
    All,
    OCR,
    Audio,
}

pub struct DatabaseManager {
    pool: SqlitePool,
}

impl DatabaseManager {
    pub async fn new(database_path: &str) -> Result<Self, sqlx::Error> {
        let connection_string = format!("sqlite:{}", database_path);

        // Create the database if it doesn't exist
        if !sqlx::Sqlite::database_exists(&connection_string).await? {
            sqlx::Sqlite::create_database(&connection_string).await?;
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(3))
            .connect(&connection_string)
            .await?;

        let db_manager = DatabaseManager { pool };
        db_manager.run_migrations().await?;
        Ok(db_manager)
    }

    async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        sqlx::migrate!("./src/migrations").run(&self.pool).await?;
        Ok(())
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
    ) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let id = sqlx::query(
            "INSERT INTO audio_transcriptions (audio_chunk_id, transcription, offset_index, timestamp) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(audio_chunk_id)
        .bind(transcription)
        .bind(offset_index)
        .bind(Utc::now())
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();
        tx.commit().await?;
        Ok(id)
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
        let mut results = sqlx::query_as::<_, OCRResult>(
            r#"
            SELECT 
                ocr_text.frame_id,
                ocr_text.text as ocr_text,
                frames.timestamp,
                video_chunks.file_path,
                frames.offset_index,
                COALESCE(json_extract(frames.metadata, '$.tags'), '[]') as tags_json
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
        .await?;

        for result in &mut results {
            result.tags =
                serde_json::from_str(&result.tags_json.unwrap_or_else(|| "[]".to_string()))
                    .unwrap_or_default();
        }

        Ok(results)
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
                audio_transcriptions.offset_index,
                COALESCE(json_extract(audio_transcriptions.metadata, '$.tags'), '[]') as tags
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

    pub async fn add_tags(
        &self,
        id: i64,
        content_type: TagContentType,
        tags: Vec<String>,
    ) -> Result<(), sqlx::Error> {
        match content_type {
            TagContentType::Vision => self.add_tags_to_frame(id, tags).await,
            TagContentType::Audio => self.add_tags_to_audio(id, tags).await,
        }
    }

    pub async fn add_tags_to_frame(
        &self,
        frame_id: i64,
        tags: Vec<String>,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        let current_metadata: Option<String> =
            sqlx::query_scalar("SELECT metadata FROM frames WHERE id = ?")
                .bind(frame_id)
                .fetch_optional(&mut *tx)
                .await?;

        if current_metadata.is_none() {
            return Err(sqlx::Error::RowNotFound);
        }

        let mut metadata: JsonValue = current_metadata
            .and_then(|m| serde_json::from_str(&m).ok())
            .unwrap_or_else(|| json!({}));

        let current_tags: Vec<String> = metadata["tags"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let mut new_tags = current_tags;
        new_tags.extend(tags);
        new_tags.sort();
        new_tags.dedup();

        metadata["tags"] = json!(new_tags);

        sqlx::query("UPDATE frames SET metadata = ? WHERE id = ?")
            .bind(serde_json::to_string(&metadata).unwrap())
            .bind(frame_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn add_tags_to_audio(
        &self,
        audio_id: i64,
        tags: Vec<String>,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        let current_metadata: Option<String> =
            sqlx::query_scalar("SELECT metadata FROM audio_transcriptions WHERE id = ?")
                .bind(audio_id)
                .fetch_optional(&mut *tx)
                .await?;

        let mut metadata: JsonValue = current_metadata
            .and_then(|m| serde_json::from_str(&m).ok())
            .unwrap_or_else(|| json!({}));

        let current_tags: Vec<String> = metadata["tags"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let mut new_tags = current_tags;
        new_tags.extend(tags);
        new_tags.sort();
        new_tags.dedup();

        metadata["tags"] = json!(new_tags);

        sqlx::query("UPDATE audio_transcriptions SET metadata = ? WHERE id = ?")
            .bind(serde_json::to_string(&metadata).unwrap())
            .bind(audio_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    // You might want to add methods to retrieve tags as well:
    pub async fn get_tags(
        &self,
        id: i64,
        content_type: TagContentType,
    ) -> Result<Vec<String>, sqlx::Error> {
        match content_type {
            TagContentType::Vision => self.get_frame_tags(id).await,
            TagContentType::Audio => self.get_audio_tags(id).await,
        }
    }

    async fn get_frame_tags(&self, frame_id: i64) -> Result<Vec<String>, sqlx::Error> {
        let metadata: Option<String> =
            sqlx::query_scalar("SELECT metadata FROM frames WHERE id = ?")
                .bind(frame_id)
                .fetch_optional(&self.pool)
                .await?;

        Ok(self.extract_tags_from_metadata(metadata))
    }

    async fn get_audio_tags(&self, audio_id: i64) -> Result<Vec<String>, sqlx::Error> {
        let metadata: Option<String> =
            sqlx::query_scalar("SELECT metadata FROM audio_transcriptions WHERE id = ?")
                .bind(audio_id)
                .fetch_optional(&self.pool)
                .await?;

        Ok(self.extract_tags_from_metadata(metadata))
    }

    fn extract_tags_from_metadata(&self, metadata: Option<String>) -> Vec<String> {
        metadata
            .and_then(|m| serde_json::from_str::<JsonValue>(&m).ok())
            .and_then(|json| json["tags"].as_array().cloned())
            .map(|arr| {
                arr.into_iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }
}

impl Clone for DatabaseManager {
    fn clone(&self) -> Self {
        DatabaseManager {
            pool: self.pool.clone(),
        }
    }
}
