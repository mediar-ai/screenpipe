use crate::filtering::filter_texts;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use log::{debug, error, info, warn};
use screenpipe_audio::{AudioDevice, DeviceType};
use screenpipe_integrations::friend_wearable::FriendWearableDatabase;
use screenpipe_vision::OcrEngine;
use serde::{Deserialize, Serialize};
use sqlx::migrate::MigrateDatabase;
use sqlx::Column;
use sqlx::Error as SqlxError;
use sqlx::Row;
use sqlx::TypeInfo;
use sqlx::ValueRef;
use sqlx::{
    sqlite::{SqlitePool, SqlitePoolOptions},
    FromRow,
};

use std::error::Error as StdError;
use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use tokio::time::{timeout, Duration as TokioDuration};
#[derive(Debug)]
pub struct DatabaseError(String);

impl fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Database error: {}", self.0)
    }
}

impl StdError for DatabaseError {}

// Intermediate struct for fetching FTS data
#[derive(FromRow)]
#[allow(dead_code)]
struct FTSSearchResultRaw {
    text_id: i64,
    matched_text: String,
    frame_id: i64,
    frame_timestamp: DateTime<Utc>,
    app_name: String,
    window_name: String,
    video_file_path: String,
    original_frame_text: Option<String>,
    tags: Option<String>,
}
// Define the FTSSearchResult struct
#[derive(Debug, Serialize, Deserialize)]
pub struct FTSSearchResult {
    pub text_id: i64,
    pub matched_text: String,
    pub frame_id: i64,
    pub frame_timestamp: DateTime<Utc>,
    pub app_name: String,
    pub window_name: String,
    pub video_file_path: String,
    pub original_frame_text: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum SearchResult {
    OCR(OCRResult),
    Audio(AudioResult),
    FTS(FTSSearchResult),
}

// Intermediate struct for fetching data
#[derive(FromRow, Debug)]
struct OCRResultRaw {
    frame_id: i64,
    ocr_text: String,
    text_json: String,
    timestamp: DateTime<Utc>,
    file_path: String,
    offset_index: i64,
    app_name: String,
    ocr_engine: String,
    window_name: String,
    tags: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OCRResult {
    pub frame_id: i64,
    pub ocr_text: String,
    pub text_json: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub app_name: String,
    pub ocr_engine: String,
    pub window_name: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, PartialEq, Default, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    #[default]
    All,
    OCR, // TODO replace by vision and make this deprecated
    Audio,
}

#[derive(FromRow)]
struct AudioResultRaw {
    audio_chunk_id: i64,
    transcription: String,
    timestamp: DateTime<Utc>,
    file_path: String,
    offset_index: i64,
    transcription_engine: String,
    tags: Option<String>,
    device_name: String,
    is_input_device: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioResult {
    pub audio_chunk_id: i64,
    pub transcription: String,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub transcription_engine: String,
    pub tags: Vec<String>,
    pub device_name: String,
    pub device_type: DeviceType,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TagContentType {
    Vision,
    Audio,
}

pub struct DatabaseManager {
    pub pool: SqlitePool,
}

impl DatabaseManager {
    pub async fn new(database_path: &str) -> Result<Self, sqlx::Error> {
        debug!(
            "Initializing DatabaseManager with database path: {}",
            database_path
        );
        let connection_string = format!("sqlite:{}", database_path);

        // Create the database if it doesn't exist
        if !sqlx::Sqlite::database_exists(&connection_string).await? {
            sqlx::Sqlite::create_database(&connection_string).await?;
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(10)
            .min_connections(3) // Minimum number of idle connections
            .acquire_timeout(Duration::from_secs(10))
            .connect(&connection_string)
            .await?;

        // Enable WAL mode
        sqlx::query("PRAGMA journal_mode = WAL;")
            .execute(&pool)
            .await?;

        // Enable SQLite's query result caching
        // PRAGMA cache_size = -2000; -- Set cache size to 2MB
        // PRAGMA temp_store = MEMORY; -- Store temporary tables and indices in memory
        sqlx::query("PRAGMA cache_size = -2000;")
            .execute(&pool)
            .await?;
        sqlx::query("PRAGMA temp_store = MEMORY;")
            .execute(&pool)
            .await?;

        let db_manager = DatabaseManager { pool };

        // Run migrations after establishing the connection
        if let Err(e) = Self::run_migrations(&db_manager.pool).await {
            error!("Failed to run migrations: {}", e);
            return Err(e);
        }

        info!("Migrations executed successfully.");
        Ok(db_manager)
    }

    async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        sqlx::migrate!("./src/migrations").run(pool).await?;
        Ok(())
    }

    pub async fn insert_audio_chunk(&self, file_path: &str) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let id = sqlx::query("INSERT INTO audio_chunks (file_path, timestamp) VALUES (?1, ?2)")
            .bind(file_path)
            .bind(Utc::now())
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
        transcription_engine: &str,
        device: &AudioDevice,
    ) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // Insert the full transcription
        let id = sqlx::query(
            "INSERT INTO audio_transcriptions (audio_chunk_id, transcription, offset_index, timestamp, transcription_engine, device, is_input_device) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(audio_chunk_id)
        .bind(transcription)
        .bind(offset_index)
        .bind(Utc::now())
        .bind(transcription_engine)
        .bind(&device.name)
        .bind(device.device_type == DeviceType::Input)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        // Commit the transaction for the full transcription
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
        debug!("insert_frame Transaction started");

        // Get the most recent video_chunk_id
        let video_chunk_id: Option<i64> =
            sqlx::query_scalar("SELECT id FROM video_chunks ORDER BY id DESC LIMIT 1")
                .fetch_optional(&mut *tx)
                .await?;
        debug!("Fetched most recent video_chunk_id: {:?}", video_chunk_id);

        // If no video chunk is found, return 0
        let video_chunk_id = match video_chunk_id {
            Some(id) => id,
            None => {
                debug!("No video chunk found, rolling back transaction");
                tx.rollback().await?;
                return Ok(0);
            }
        };

        // Calculate the offset_index
        let offset_index: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(offset_index), -1) + 1 FROM frames WHERE video_chunk_id = ?1",
        )
        .bind(video_chunk_id)
        .fetch_one(&mut *tx)
        .await?;
        debug!("insert_frame Calculated offset_index: {}", offset_index);

        // Insert the new frame
        let id = sqlx::query(
            "INSERT INTO frames (video_chunk_id, offset_index, timestamp) VALUES (?1, ?2, ?3)",
        )
        .bind(video_chunk_id)
        .bind(offset_index)
        .bind(Utc::now())
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();
        debug!("insert_frame Inserted new frame with id: {}", id);

        // Commit the transaction
        tx.commit().await?;
        // debug!("insert_frame Transaction committed");

        Ok(id)
    }

    pub async fn insert_ocr_text(
        &self,
        frame_id: i64,
        text: &str,
        text_json: &str,
        app_name: &str,
        window_name: &str,
        ocr_engine: Arc<OcrEngine>,
        focused: bool,
    ) -> Result<(), sqlx::Error> {
        const MAX_RETRIES: u32 = 3;
        const TIMEOUT_DURATION: TokioDuration = TokioDuration::from_secs(10);

        for attempt in 1..=MAX_RETRIES {
            match timeout(
                TIMEOUT_DURATION,
                self.insert_ocr_text_old(
                    frame_id,
                    text,
                    text_json,
                    app_name,
                    window_name,
                    Arc::clone(&ocr_engine),
                    focused,
                ),
            )
            .await
            {
                Ok(Ok(())) => {
                    return Ok(());
                }
                Ok(Err(e)) => {
                    error!("Failed to insert OCR text on attempt {}: {}", attempt, e);
                }
                Err(_) => {
                    warn!(
                        "Timeout occurred on attempt {} while inserting OCR text for frame_id: {}",
                        attempt, frame_id
                    );
                }
            }

            if attempt < MAX_RETRIES {
                warn!(
                    "Retrying to insert OCR text for frame_id: {} (attempt {}/{})",
                    frame_id,
                    attempt + 1,
                    MAX_RETRIES
                );
            } else {
                error!(
                    "Failed to insert OCR text for frame_id: {} after {} attempts",
                    frame_id, MAX_RETRIES
                );
                return Err(sqlx::Error::PoolTimedOut); // Return error after max retries
            }
        }

        error!(
            "Exiting insert_ocr_text for frame_id: {} with PoolTimedOut error",
            frame_id
        );
        Err(sqlx::Error::PoolTimedOut)
    }

    async fn insert_ocr_text_old(
        &self,
        frame_id: i64,
        text: &str,
        text_json: &str,
        app_name: &str,
        window_name: &str,
        ocr_engine: Arc<OcrEngine>,
        focused: bool,
    ) -> Result<(), sqlx::Error> {
        let display_window_name = if window_name.chars().count() > 20 {
            format!("{}...", window_name.chars().take(20).collect::<String>())
        } else {
            window_name.to_string()
        };

        debug!(
            "Inserting OCR: frame_id {}, app {}, window {}, focused {}, text {}{}",
            frame_id,
            app_name,
            display_window_name,
            focused,
            text.replace('\n', " ").chars().take(60).collect::<String>(),
            if text.len() > 60 { "..." } else { "" },
        );

        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO ocr_text (frame_id, text, text_json, app_name, ocr_engine, window_name, focused) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
            .bind(frame_id)
            .bind(text)
            .bind(text_json)
            .bind(app_name)
            .bind(format!("{:?}", *ocr_engine))
            .bind(window_name)
            .bind(focused)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        debug!("OCR text inserted into db successfully");
        Ok(())
    }

    pub async fn search(
        &self,
        query: &str,
        content_type: ContentType,
        limit: u32,
        offset: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>,
        window_name: Option<&str>,
        min_length: Option<usize>,
        max_length: Option<usize>,
    ) -> Result<Vec<SearchResult>, sqlx::Error> {
        let mut results = Vec::new();

        if content_type == ContentType::All || content_type == ContentType::OCR {
            let ocr_results = self
                .search_ocr(
                    query,
                    limit,
                    offset,
                    start_time,
                    end_time,
                    app_name,
                    window_name,
                    min_length,
                    max_length,
                )
                .await?;
            results.extend(ocr_results.into_iter().map(SearchResult::OCR));
        }

        if (content_type == ContentType::All || content_type == ContentType::Audio)
            && app_name.is_none()
            && window_name.is_none()
        {
            let audio_results = self
                .search_audio(
                    query, limit, offset, start_time, end_time, min_length, max_length,
                )
                .await?;
            results.extend(audio_results.into_iter().map(SearchResult::Audio));
        }

        Ok(results)
    }

    async fn search_ocr(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>,
        window_name: Option<&str>,
        min_length: Option<usize>,
        max_length: Option<usize>,
    ) -> Result<Vec<OCRResult>, sqlx::Error> {
        let mut sql = format!(
            r#"
            SELECT 
                ocr_text.frame_id,
                ocr_text.text as ocr_text,
                ocr_text.text_json,
                frames.timestamp,
                video_chunks.file_path,
                frames.offset_index,
                ocr_text.app_name,
                ocr_text.ocr_engine,
                ocr_text.window_name,
                GROUP_CONCAT(tags.name, ',') as tags
            FROM 
                ocr_text
            JOIN 
                frames ON ocr_text.frame_id = frames.id
            JOIN 
                video_chunks ON frames.video_chunk_id = video_chunks.id
            LEFT JOIN
                vision_tags ON frames.id = vision_tags.vision_id
            LEFT JOIN
                tags ON vision_tags.tag_id = tags.id
            WHERE 
                (?1 = '' OR ocr_text.text LIKE '%' || ?1 || '%' COLLATE NOCASE)
                AND ocr_text.text != 'No text found'
                AND (?2 IS NULL OR frames.timestamp >= ?2)
                AND (?3 IS NULL OR frames.timestamp <= ?3)
                AND (?4 IS NULL OR LENGTH(ocr_text.text) >= ?4)
                AND (?5 IS NULL OR LENGTH(ocr_text.text) <= ?5)
                AND (?6 IS NULL OR ocr_text.app_name LIKE '%' || ?6 || '%' COLLATE NOCASE)
                AND (?7 IS NULL OR ocr_text.window_name LIKE '%' || ?7 || '%' COLLATE NOCASE)
        "#,
        );

        sql.push_str(
            r#"
            GROUP BY 
                ocr_text.frame_id
            ORDER BY 
                frames.timestamp DESC
            LIMIT ?8 OFFSET ?9
            "#,
        );

        let query = sqlx::query_as::<_, OCRResultRaw>(&sql)
            .bind(query.trim()) // Trim the query to handle empty strings properly
            .bind(start_time)
            .bind(end_time)
            .bind(min_length.map(|l| l as i64))
            .bind(max_length.map(|l| l as i64))
            .bind(app_name)
            .bind(window_name)
            .bind(limit)
            .bind(offset);

        let ocr_results_raw = query.fetch_all(&self.pool).await?;

        let ocr_results: Vec<OCRResult> = ocr_results_raw
            .into_iter()
            .map(|raw| OCRResult {
                frame_id: raw.frame_id,
                ocr_text: raw.ocr_text,
                text_json: raw.text_json,
                timestamp: raw.timestamp,
                file_path: raw.file_path,
                offset_index: raw.offset_index,
                app_name: raw.app_name,
                ocr_engine: raw.ocr_engine,
                window_name: raw.window_name,
                tags: raw
                    .tags
                    .map(|s| s.split(',').map(String::from).collect())
                    .unwrap_or_default(),
            })
            .collect();

        Ok(ocr_results)
    }

    pub async fn search_audio(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        min_length: Option<usize>,
        max_length: Option<usize>,
    ) -> Result<Vec<AudioResult>, sqlx::Error> {
        let mut sql = format!(
            r#"
        SELECT 
            audio_transcriptions.audio_chunk_id,
            audio_transcriptions.transcription,
            audio_transcriptions.timestamp,
            audio_chunks.file_path,
            audio_transcriptions.offset_index,
            audio_transcriptions.transcription_engine,
            GROUP_CONCAT(tags.name, ',') as tags,
            audio_transcriptions.device as device_name,
            audio_transcriptions.is_input_device
        FROM 
            audio_transcriptions
        JOIN 
            audio_chunks ON audio_transcriptions.audio_chunk_id = audio_chunks.id
        LEFT JOIN
            audio_tags ON audio_chunks.id = audio_tags.audio_chunk_id
        LEFT JOIN
            tags ON audio_tags.tag_id = tags.id
        WHERE 
            (?1 = '' OR audio_transcriptions.transcription LIKE '%' || ?1 || '%' COLLATE NOCASE)
            AND (?2 IS NULL OR audio_transcriptions.timestamp >= ?2)
            AND (?3 IS NULL OR audio_transcriptions.timestamp <= ?3)
            AND (?4 IS NULL OR LENGTH(audio_transcriptions.transcription) >= ?4)
            AND (?5 IS NULL OR LENGTH(audio_transcriptions.transcription) <= ?5)
        "#,
        );

        sql.push_str(
            r#"
        GROUP BY
            audio_transcriptions.audio_chunk_id,
            audio_transcriptions.transcription,
            audio_transcriptions.timestamp,
            audio_transcriptions.offset_index
        ORDER BY 
            audio_transcriptions.timestamp DESC
        LIMIT ?6 OFFSET ?7
        "#,
        );

        let query = sqlx::query_as::<_, AudioResultRaw>(&sql)
            .bind(query)
            .bind(start_time)
            .bind(end_time)
            .bind(min_length.map(|l| l as i64))
            .bind(max_length.map(|l| l as i64))
            .bind(limit)
            .bind(offset);

        let audio_results_raw = query.fetch_all(&self.pool).await?;

        // Parse the tags string into a Vec<String>
        let audio_results = audio_results_raw
            .into_iter()
            .map(|raw| AudioResult {
                audio_chunk_id: raw.audio_chunk_id,
                transcription: raw.transcription,
                timestamp: raw.timestamp,
                file_path: raw.file_path,
                offset_index: raw.offset_index,
                transcription_engine: raw.transcription_engine,
                tags: raw
                    .tags
                    .map(|s| s.split(',').map(String::from).collect())
                    .unwrap_or_default(),
                device_name: raw.device_name,
                device_type: if raw.is_input_device {
                    DeviceType::Input
                } else {
                    DeviceType::Output
                },
            })
            .collect();

        Ok(audio_results)
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

    pub async fn count_search_results(
        &self,
        query: &str,
        content_type: ContentType,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>,
        window_name: Option<&str>,
        min_length: Option<usize>,
        max_length: Option<usize>,
    ) -> Result<usize, sqlx::Error> {
        let mut total_count = 0;

        // If app_name or window_name is specified, only count OCR results
        if app_name.is_some() || window_name.is_some() {
            let ocr_count = self
                .count_ocr_results(
                    query,
                    start_time,
                    end_time,
                    app_name,
                    window_name,
                    min_length,
                    max_length,
                )
                .await?;
            total_count += ocr_count;
        } else {
            // If no app_name or window_name is specified, proceed with normal counting
            if content_type == ContentType::All || content_type == ContentType::OCR {
                let ocr_count = self
                    .count_ocr_results(
                        query, start_time, end_time, None, None, min_length, max_length,
                    )
                    .await?;
                total_count += ocr_count;
            }

            if content_type == ContentType::All || content_type == ContentType::Audio {
                let audio_count = self
                    .count_audio_results(query, start_time, end_time, min_length, max_length)
                    .await?;
                total_count += audio_count;
            }
        }

        Ok(total_count)
    }

    async fn count_ocr_results(
        &self,
        query: &str,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>,
        window_name: Option<&str>,
        min_length: Option<usize>,
        max_length: Option<usize>,
    ) -> Result<usize, sqlx::Error> {
        let sql = r#"
            SELECT COUNT(*)
            FROM ocr_text
            JOIN frames ON ocr_text.frame_id = frames.id
            WHERE 
                (?1 = '' OR ocr_text.text LIKE '%' || ?1 || '%' COLLATE NOCASE)
                AND ocr_text.text != 'No text found'
                AND (?2 IS NULL OR frames.timestamp >= ?2)
                AND (?3 IS NULL OR frames.timestamp <= ?3)
                AND (?4 IS NULL OR LENGTH(ocr_text.text) >= ?4)
                AND (?5 IS NULL OR LENGTH(ocr_text.text) <= ?5)
                AND (?6 IS NULL OR ocr_text.app_name LIKE '%' || ?6 || '%' COLLATE NOCASE)
                AND (?7 IS NULL OR ocr_text.window_name LIKE '%' || ?7 || '%' COLLATE NOCASE)
        "#
        .to_string();

        let query = sqlx::query_as::<_, (i64,)>(&sql)
            .bind(query)
            .bind(start_time)
            .bind(end_time)
            .bind(min_length.map(|l| l as i64))
            .bind(max_length.map(|l| l as i64))
            .bind(app_name)
            .bind(window_name);

        let (count,) = query.fetch_one(&self.pool).await?;
        Ok(count as usize)
    }
    async fn count_audio_results(
        &self,
        query: &str,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        min_length: Option<usize>,
        max_length: Option<usize>,
    ) -> Result<usize, sqlx::Error> {
        let sql = r#"
            SELECT COUNT(*)
            FROM audio_transcriptions
            JOIN audio_chunks ON audio_transcriptions.audio_chunk_id = audio_chunks.id
            WHERE 
                (?1 = '' OR audio_transcriptions.transcription LIKE '%' || ?1 || '%' COLLATE NOCASE)
                AND (?2 IS NULL OR audio_transcriptions.timestamp >= ?2)
                AND (?3 IS NULL OR audio_transcriptions.timestamp <= ?3)
                AND (?4 IS NULL OR LENGTH(audio_transcriptions.transcription) >= ?4)
                AND (?5 IS NULL OR LENGTH(audio_transcriptions.transcription) <= ?5)
        "#;

        let query = sqlx::query_as::<_, (i64,)>(sql)
            .bind(query)
            .bind(start_time)
            .bind(end_time)
            .bind(min_length.map(|l| l as i64))
            .bind(max_length.map(|l| l as i64));

        let (count,) = query.fetch_one(&self.pool).await?;
        Ok(count as usize)
    }
    pub async fn get_latest_timestamps(
        &self,
    ) -> Result<(Option<DateTime<Utc>>, Option<DateTime<Utc>>), sqlx::Error> {
        let latest_frame: Option<(DateTime<Utc>,)> =
            sqlx::query_as("SELECT timestamp FROM frames ORDER BY timestamp DESC LIMIT 1")
                .fetch_optional(&self.pool)
                .await?;

        let latest_audio: Option<(DateTime<Utc>,)> =
            sqlx::query_as("SELECT timestamp FROM audio_chunks ORDER BY timestamp DESC LIMIT 1")
                .fetch_optional(&self.pool)
                .await?;

        Ok((latest_frame.map(|f| f.0), latest_audio.map(|a| a.0)))
    }

    // Modify the insert_chunked_text method to handle both OCR and audio transcriptions
    pub async fn insert_chunked_text(
        &self,
        id: i64,
        text: &str,
        timestamp: DateTime<Utc>,
        engine: &str,
        chunking_engine: &str,
        source: ContentSource,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // Insert or get the text_id
        let text_id: i64 = sqlx::query_scalar(
            "INSERT INTO chunked_text_index (text) VALUES (?1) ON CONFLICT(text) DO UPDATE SET text=text RETURNING text_id",
        )
        .bind(text)
        .fetch_one(&mut *tx)
        .await?;

        // Insert the entry into chunked_text_entries
        let query = match source {
            ContentSource::Audio => "INSERT INTO chunked_text_entries (text_id, audio_chunk_id, timestamp, engine, chunking_engine, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            ContentSource::Screen => "INSERT INTO chunked_text_entries (text_id, frame_id, timestamp, engine, chunking_engine, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        };

        sqlx::query(query)
            .bind(text_id)
            .bind(id)
            .bind(timestamp)
            .bind(engine)
            .bind(chunking_engine)
            .bind(source.to_string())
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn search_chunked_text(
        &self,
        query: &str,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
    ) -> Result<Vec<(i64, DateTime<Utc>)>, sqlx::Error> {
        let sql = r#"
            SELECT 
                chunked_text_entries.frame_id,
                chunked_text_entries.timestamp
            FROM 
                chunked_text_index
            JOIN 
                chunked_text_entries ON chunked_text_index.text_id = chunked_text_entries.text_id
            WHERE 
                chunked_text_index.text LIKE '%' || ?1 || '%' COLLATE NOCASE
                AND (?2 IS NULL OR chunked_text_entries.timestamp >= ?2)
                AND (?3 IS NULL OR chunked_text_entries.timestamp <= ?3)
            ORDER BY 
                chunked_text_entries.timestamp DESC
        "#;

        let results = sqlx::query_as::<_, (i64, DateTime<Utc>)>(sql)
            .bind(query)
            .bind(start_time)
            .bind(end_time)
            .fetch_all(&self.pool)
            .await?;

        Ok(results)
    }

    pub async fn get_chunked_data_since_last_request(
        &self,
        memory_source: &str,
        friend_user_id: &str,
    ) -> Result<(Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>), DatabaseError> {
        let last_request_info = self
            .get_last_successful_request_info(memory_source, friend_user_id)
            .await?;
        let (last_chunk_id, last_timestamp) = last_request_info
            .map(|(chunk_range, time_range, _)| {
                let last_chunk_id = chunk_range
                    .split('-')
                    .last()
                    .unwrap_or("0")
                    .parse::<i64>()
                    .unwrap_or(0);
                let last_timestamp = DateTime::parse_from_rfc3339(
                    time_range
                        .split('-')
                        .last()
                        .unwrap_or("1970-01-01T00:00:00Z"),
                )
                .unwrap_or_else(|_| DateTime::parse_from_rfc3339("1970-01-01T00:00:00Z").unwrap())
                .with_timezone(&Utc);
                (last_chunk_id, last_timestamp)
            })
            .unwrap_or((
                0,
                DateTime::parse_from_rfc3339("1970-01-01T00:00:00Z")
                    .unwrap()
                    .with_timezone(&Utc),
            ));

        let query = r#"
            SELECT 
                GROUP_CONCAT(cti.text, ' ') as texts,
                MIN(COALESCE(cte.frame_id, cte.audio_chunk_id)) as min_chunk_id,
                MAX(COALESCE(cte.frame_id, cte.audio_chunk_id)) as max_chunk_id,
                MIN(cte.timestamp) as min_timestamp,
                MAX(cte.timestamp) as max_timestamp
            FROM chunked_text_index cti
            JOIN chunked_text_entries cte ON cti.text_id = cte.text_id
            WHERE cte.source = ?1 AND (cte.timestamp > ?2 OR (cte.timestamp = ?2 AND COALESCE(cte.frame_id, cte.audio_chunk_id) > ?3))
        "#;

        sqlx::query_as(query)
            .bind(memory_source)
            .bind(&last_timestamp.to_rfc3339())
            .bind(&last_chunk_id.to_string())
            .fetch_one(&self.pool)
            .await
            .map(|row: (String, i64, i64, String, String)| {
                (
                    row.0.split(' ').map(String::from).collect(),
                    row.1,
                    row.2,
                    DateTime::parse_from_rfc3339(&row.3)
                        .unwrap()
                        .with_timezone(&Utc),
                    DateTime::parse_from_rfc3339(&row.4)
                        .unwrap()
                        .with_timezone(&Utc),
                )
            })
            .map_err(|e| DatabaseError(e.to_string()))
    }

    pub async fn get_last_successful_request_info(
        &self,
        memory_source: &str,
        friend_user_id: &str,
    ) -> Result<Option<(String, String, String)>, DatabaseError> {
        let query = r#"
            SELECT chunk_id_range, timestamp_range, request_id
            FROM friend_wearable_requests
            WHERE memory_source = ?1 AND friend_user_id = ?2
            ORDER BY created_at DESC
            LIMIT 1
        "#;
        sqlx::query_as(query)
            .bind(memory_source)
            .bind(friend_user_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| DatabaseError(e.to_string()))
    }

    pub async fn insert_friend_wearable_request(
        &self,
        request_id: &str,
        memory_source: &str,
        chunk_id_range: &str,
        timestamp_range: &str,
        friend_user_id: &str,
        filtered_text: &str,
        structured_response: &str,
        response_id: &str,
        response_created_at: DateTime<Utc>,
    ) -> Result<(), DatabaseError> {
        let query = r#"
            INSERT INTO friend_wearable_requests (
                request_id, memory_source, chunk_id_range, timestamp_range, friend_user_id,
                filtered_text, structured_response, response_id, response_created_at, is_successful
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#;

        let is_successful = !structured_response.contains("\"error\"");

        sqlx::query(query)
            .bind(request_id)
            .bind(memory_source)
            .bind(chunk_id_range)
            .bind(timestamp_range)
            .bind(friend_user_id)
            .bind(filtered_text)
            .bind(structured_response)
            .bind(response_id)
            .bind(response_created_at)
            .bind(is_successful)
            .execute(&self.pool)
            .await
            .map(|_| ())
            .map_err(|e| DatabaseError(e.to_string()))
    }

    pub async fn add_tags(
        &self,
        id: i64,
        content_type: TagContentType,
        tags: Vec<String>,
    ) -> Result<(), SqlxError> {
        match content_type {
            TagContentType::Vision => self.add_tags_to_vision(id, tags).await,
            TagContentType::Audio => self.add_tags_to_audio(id, tags).await,
        }
    }

    async fn add_tags_to_vision(&self, frame_id: i64, tags: Vec<String>) -> Result<(), SqlxError> {
        let mut tx = self.pool.begin().await?;

        for tag in tags {
            // Insert tag if it doesn't exist
            let tag_id: i64 = sqlx::query_scalar(
                "INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name=name RETURNING id",
            )
            .bind(&tag)
            .fetch_one(&mut *tx)
            .await?;

            // Insert into vision_tags
            sqlx::query(
                "INSERT INTO vision_tags (vision_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
            )
            .bind(frame_id)
            .bind(tag_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn add_tags_to_audio(
        &self,
        audio_chunk_id: i64,
        tags: Vec<String>,
    ) -> Result<(), SqlxError> {
        let mut tx = self.pool.begin().await?;

        for tag in tags {
            // Insert tag if it doesn't exist
            let tag_id: i64 = sqlx::query_scalar(
                "INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name=name RETURNING id",
            )
            .bind(&tag)
            .fetch_one(&mut *tx)
            .await?;

            // Insert into audio_tags
            sqlx::query(
                "INSERT INTO audio_tags (audio_chunk_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
            )
            .bind(audio_chunk_id)
            .bind(tag_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn get_tags(
        &self,
        id: i64,
        content_type: TagContentType,
    ) -> Result<Vec<String>, SqlxError> {
        match content_type {
            TagContentType::Vision => self.get_vision_tags(id).await,
            TagContentType::Audio => self.get_audio_tags(id).await,
        }
    }

    async fn get_vision_tags(&self, vision_id: i64) -> Result<Vec<String>, SqlxError> {
        sqlx::query_scalar(
            r#"
            SELECT t.name
            FROM tags t
            JOIN vision_tags vt ON t.id = vt.tag_id
            WHERE vt.vision_id = ?
            ORDER BY t.name
            "#,
        )
        .bind(vision_id)
        .fetch_all(&self.pool)
        .await
    }

    async fn get_audio_tags(&self, audio_chunk_id: i64) -> Result<Vec<String>, SqlxError> {
        sqlx::query_scalar(
            r#"
            SELECT t.name
            FROM tags t
            JOIN audio_tags at ON t.id = at.tag_id
            WHERE at.audio_chunk_id = ?
            ORDER BY t.name
            "#,
        )
        .bind(audio_chunk_id)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn remove_tags(
        &self,
        id: i64,
        content_type: TagContentType,
        tags: Vec<String>,
    ) -> Result<(), SqlxError> {
        match content_type {
            TagContentType::Vision => self.remove_vision_tags(id, tags).await,
            TagContentType::Audio => self.remove_audio_tags(id, tags).await,
        }
    }

    async fn remove_vision_tags(&self, vision_id: i64, tags: Vec<String>) -> Result<(), SqlxError> {
        let mut tx = self.pool.begin().await?;

        for tag in tags {
            sqlx::query(
                r#"
                DELETE FROM vision_tags
                WHERE vision_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)
                "#,
            )
            .bind(vision_id)
            .bind(&tag)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn remove_audio_tags(
        &self,
        audio_chunk_id: i64,
        tags: Vec<String>,
    ) -> Result<(), SqlxError> {
        let mut tx = self.pool.begin().await?;

        for tag in tags {
            sqlx::query(
                r#"
                DELETE FROM audio_tags
                WHERE audio_chunk_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)
                "#,
            )
            .bind(audio_chunk_id)
            .bind(&tag)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }
    pub async fn execute_raw_sql(&self, query: &str) -> Result<serde_json::Value, sqlx::Error> {
        let rows = sqlx::query(query).fetch_all(&self.pool).await?;

        let result: Vec<serde_json::Map<String, serde_json::Value>> = rows
            .iter()
            .map(|row| {
                let mut map = serde_json::Map::new();
                for (i, column) in row.columns().iter().enumerate() {
                    if let Ok(value) = row.try_get_raw(i) {
                        let json_value = match value.type_info().name() {
                            "TEXT" => {
                                let s: String = row.try_get(i).unwrap_or_default();
                                serde_json::Value::String(s)
                            }
                            "INTEGER" => {
                                let i: i64 = row.try_get(i).unwrap_or_default();
                                serde_json::Value::Number(i.into())
                            }
                            "REAL" => {
                                let f: f64 = row.try_get(i).unwrap_or_default();
                                serde_json::Value::Number(
                                    serde_json::Number::from_f64(f).unwrap_or(0.into()),
                                )
                            }
                            _ => serde_json::Value::Null,
                        };
                        map.insert(column.name().to_string(), json_value);
                    }
                }
                map
            })
            .collect();

        Ok(serde_json::Value::Array(
            result.into_iter().map(serde_json::Value::Object).collect(),
        ))
    }
}

impl Clone for DatabaseManager {
    fn clone(&self) -> Self {
        DatabaseManager {
            pool: self.pool.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentSource {
    Screen,
    Audio,
}

impl ToString for ContentSource {
    fn to_string(&self) -> String {
        match self {
            ContentSource::Screen => "screen".to_string(),
            ContentSource::Audio => "audio".to_string(),
        }
    }
}

#[async_trait]
impl FriendWearableDatabase for DatabaseManager {
    async fn get_chunked_data_since_last_request(
        &self,
        memory_source: &str,
        friend_user_id: &str,
    ) -> Result<
        (Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>),
        Box<dyn StdError + Send + Sync>,
    > {
        self.get_chunked_data_since_last_request(memory_source, friend_user_id)
            .await
            .map_err(|e| Box::new(e) as Box<dyn StdError + Send + Sync>)
    }

    async fn get_chunked_data_since_timestamp(
        &self,
        memory_source: &str,
        _friend_user_id: &str,
        since: DateTime<Utc>,
    ) -> Result<
        (Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>),
        Box<dyn StdError + Send + Sync>,
    > {
        let since_str = since.to_rfc3339();
        let filtered_text = filter_texts(&since_str, memory_source, &self.pool).await?;

        let texts: Vec<String> = filtered_text.split('\n').map(String::from).collect();

        let min_chunk_id = 0;
        let max_chunk_id = texts.len() as i64 - 1;
        let min_timestamp = since;
        let max_timestamp = Utc::now();

        Ok((
            texts,
            min_chunk_id,
            max_chunk_id,
            min_timestamp,
            max_timestamp,
        ))
    }

    async fn insert_friend_wearable_request(
        &self,
        request_id: &str,
        memory_source: &str,
        chunk_id_range: &str,
        timestamp_range: &str,
        friend_user_id: &str,
        filtered_text: &str,
        structured_response: &str,
        response_id: &str,
        response_created_at: DateTime<Utc>,
    ) -> Result<(), Box<dyn StdError + Send + Sync>> {
        self.insert_friend_wearable_request(
            request_id,
            memory_source,
            chunk_id_range,
            timestamp_range,
            friend_user_id,
            filtered_text,
            structured_response,
            response_id,
            response_created_at,
        )
        .await
        .map_err(|e| Box::new(e) as Box<dyn StdError + Send + Sync>)
    }
}
