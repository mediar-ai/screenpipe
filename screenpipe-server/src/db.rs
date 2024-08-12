use chrono::{DateTime, Utc};
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use sqlx::migrate::MigrateDatabase;
use sqlx::{
    sqlite::{SqlitePool, SqlitePoolOptions},
    FromRow,
};
use std::time::Duration;
use tokio::time::{timeout, Duration as TokioDuration};
use crate::chunking::{text_chunking_by_similarity, text_chunking_simple};
use screenpipe_vision::OcrEngine;
use std::sync::Arc;
use screenpipe_integrations::friend_wearable::FriendWearableDatabase;
use async_trait::async_trait;
use std::error::Error as StdError;
use std::fmt;
use screenpipe_integrations::unstructured_ocr::unstructured_chunking;
use crate::filtering::filter_texts;

#[derive(Debug)]
pub struct DatabaseError(String);

impl fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Database error: {}", self.0)
    }
}

impl StdError for DatabaseError {}

#[derive(Debug, Serialize)]
pub enum SearchResult {
    OCR(OCRResult),
    Audio(AudioResult),
}

#[derive(Debug, Serialize, FromRow)]
pub struct OCRResult {
    pub frame_id: i64,
    pub ocr_text: String,
    pub text_json: String,                       // Store as JSON string
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub offset_index: i64,
    pub app_name: String,
    pub ocr_engine: String,  // Add this line
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
    pub transcription_engine: String, // Add this line
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
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // Insert the full transcription
        sqlx::query(
            "INSERT INTO audio_transcriptions (audio_chunk_id, transcription, offset_index, timestamp, transcription_engine) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(audio_chunk_id)
        .bind(transcription)
        .bind(offset_index)
        .bind(Utc::now())
        .bind(transcription_engine)
        .execute(&mut *tx)
        .await?;

        // Commit the transaction for the full transcription
        tx.commit().await?;

        // Now, let's chunk the transcription and insert into chunk tables
        const CHUNKING_ENGINE: &str = "local_simple";

        let chunks = match CHUNKING_ENGINE {
            "local_simple" => text_chunking_simple(transcription),
            "candle_jina_bert" => text_chunking_by_similarity(transcription).await,
            "unstructured" => unstructured_chunking(transcription).map_err(|e| anyhow::anyhow!(e)).and_then(|chunks| Ok(chunks)),
            _ => text_chunking_simple(transcription), // Default to simple chunking for unknown engines
        };

        match chunks {
            Ok(chunks) => {
                info!("Successfully chunked audio transcription into {} chunks", chunks.len());
                for chunk in chunks.iter() {
                    if let Err(e) = self.insert_chunked_text(
                        audio_chunk_id,
                        chunk,
                        Utc::now(),
                        transcription_engine,
                        CHUNKING_ENGINE,
                        ContentSource::Audio,
                    ).await {
                        error!("Failed to insert chunk into chunked text index: {}", e);
                    }
                }
            }
            Err(e) => {
                error!("Failed to chunk audio transcription: {}", e);
                // Fallback to inserting the whole transcription as a single chunk
                if let Err(e) = self.insert_chunked_text(
                    audio_chunk_id,
                    transcription,
                    Utc::now(),
                    transcription_engine,
                    "No_Chunking",
                    ContentSource::Audio,
                ).await {
                    error!("Failed to insert whole audio transcription into chunked text index: {}", e);
                }
            }
        }

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

    pub async fn insert_frame(&self, app_name: &str) -> Result<i64, sqlx::Error> {
        // debug!("Starting insert_frame");

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
        "INSERT INTO frames (video_chunk_id, offset_index, timestamp, app_name) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(video_chunk_id)
        .bind(offset_index)
        .bind(Utc::now())
        .bind(app_name)
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
        ocr_engine: Arc<OcrEngine>,
    ) -> Result<(), sqlx::Error> {
        const MAX_RETRIES: u32 = 3;
        const TIMEOUT_DURATION: TokioDuration = TokioDuration::from_secs(10);

        // debug!("Starting insert_ocr_text for frame_id: {}", frame_id);

        for attempt in 1..=MAX_RETRIES {
            // debug!("Attempt {} to insert OCR text", attempt);
            match timeout(
                TIMEOUT_DURATION,
                self.insert_ocr_text_old(
                    frame_id,
                    text,
                    text_json,
                    app_name,
                    Arc::clone(&ocr_engine),
                ),
            )
            .await
            {
                Ok(Ok(())) => {
                    // debug!("Successfully inserted OCR text, proceeding to chunking");
                    // Chunk the text before inserting into chunked text index
                    const CHUNKING_ENGINE: &str = "local_simple";

                    let chunks = match CHUNKING_ENGINE {
                        "local_simple" => text_chunking_simple(text),
                        "candle_jina_bert" => text_chunking_by_similarity(text).await,
                        "unstructured" => unstructured_chunking(text).map_err(|e| anyhow::anyhow!(e)).and_then(|chunks| Ok(chunks)),
                        _ => text_chunking_simple(text), // Default to simple chunking for unknown engines
                    };

                    match chunks {
                        Ok(chunks) => {
                            debug!("Successfully chunked text into {} chunks", chunks.len());
                            for chunk in chunks.iter() {
                                if let Err(e) = self.insert_chunked_text(
                                    frame_id,
                                    chunk,
                                    Utc::now(),
                                    &format!("{:?}", *ocr_engine),
                                    CHUNKING_ENGINE,
                                    ContentSource::Screen,
                                ).await {
                                    error!("Failed to insert chunk into chunked text index: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            error!("Failed to chunk text: {}", e);
                            // Fallback to inserting the whole text if chunking fails
                            debug!("Inserting whole text as a single chunk");
                            if let Err(e) = self.insert_chunked_text(
                                frame_id,
                                text,
                                Utc::now(),
                                &format!("{:?}", *ocr_engine),
                                "No_Chunking",
                                ContentSource::Screen,
                            ).await {
                                error!("Failed to insert whole text into chunked text index: {}", e);
                            }
                        }
                    }
                    info!(
                        "Successfully completed OCR text insertion for frame_id: {} on attempt {}",
                        frame_id, attempt
                    );
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

        error!("Exiting insert_ocr_text for frame_id: {} with PoolTimedOut error", frame_id);
        Err(sqlx::Error::PoolTimedOut)
    }

    async fn insert_ocr_text_old(
        &self,
        frame_id: i64,
        text: &str,
        text_json: &str,
        app_name: &str,
        ocr_engine: Arc<OcrEngine>,
    ) -> Result<(), sqlx::Error> {
        // debug!("Starting insert_ocr_text_old for frame_id: {}", frame_id);

        // Log the input parameters with limited length
        debug!(
            "Inserting OCR text with frame_id: {}, text: {}{}",
            frame_id,
            text.replace('\n', " ").chars().take(100).collect::<String>(),
            if text.len() > 100 { "..." } else { "" }
        );

        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO ocr_text (frame_id, text, text_json, app_name, ocr_engine) VALUES (?1, ?2, ?3, ?4, ?5)")
            .bind(frame_id)
            .bind(text)
            .bind(text_json)
            .bind(app_name)
            .bind(format!("{:?}", *ocr_engine))
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
    ) -> Result<Vec<SearchResult>, sqlx::Error> {
        let mut results = Vec::new();

        // If app_name is specified, only search OCR content
        if app_name.is_some() {
            let ocr_results = self
                .search_ocr(query, limit, offset, start_time, end_time, app_name)
                .await?;
            results.extend(ocr_results.into_iter().map(SearchResult::OCR));
        } else {
            // If no app_name is specified, proceed with normal search
            if content_type == ContentType::All || content_type == ContentType::OCR {
                let ocr_results = self
                    .search_ocr(query, limit, offset, start_time, end_time, None)
                    .await?;
                results.extend(ocr_results.into_iter().map(SearchResult::OCR));
            }

            if content_type == ContentType::All || content_type == ContentType::Audio {
                let audio_results = self
                    .search_audio(query, limit, offset, start_time, end_time)
                    .await?;
                results.extend(audio_results.into_iter().map(SearchResult::Audio));
            }
        }

        // Sort results by timestamp in descending order
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

        // Apply limit after combining and sorting
        results.truncate(limit as usize);

        Ok(results)
    }

    // Update the search_ocr method
    async fn search_ocr(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>, // Add this parameter
    ) -> Result<Vec<OCRResult>, sqlx::Error> {
        let mut sql = r#"
            SELECT 
                ocr_text.frame_id,
                ocr_text.text as ocr_text,
                ocr_text.text_json,
                frames.timestamp,
                video_chunks.file_path,
                frames.offset_index,
                frames.app_name,
                ocr_text.ocr_engine
            FROM 
                ocr_text
            JOIN 
                frames ON ocr_text.frame_id = frames.id
            JOIN 
                video_chunks ON frames.video_chunk_id = video_chunks.id
            WHERE 
                ocr_text.text LIKE '%' || ?1 || '%'
                AND (?2 IS NULL OR frames.timestamp >= ?2)
                AND (?3 IS NULL OR frames.timestamp <= ?3)
        "#
        .to_string();

        if app_name.is_some() {
            sql.push_str(" AND frames.app_name = ?6");
        }

        sql.push_str(
            r#"
            ORDER BY 
                frames.timestamp DESC
            LIMIT ?4 OFFSET ?5
            "#,
        );

        let mut query = sqlx::query_as::<_, OCRResult>(&sql)
            .bind(query)
            .bind(start_time)
            .bind(end_time)
            .bind(limit)
            .bind(offset);

        if let Some(app_name) = app_name {
            query = query.bind(app_name);
        }

        query.fetch_all(&self.pool).await
    }

    async fn search_audio(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
    ) -> Result<Vec<AudioResult>, sqlx::Error> {
        sqlx::query_as::<_, AudioResult>(
            r#"
            SELECT 
                audio_transcriptions.audio_chunk_id,
                audio_transcriptions.transcription,
                audio_transcriptions.timestamp,
                audio_chunks.file_path,
                audio_transcriptions.offset_index,
                audio_transcriptions.transcription_engine
            FROM 
                audio_transcriptions
            JOIN 
                audio_chunks ON audio_transcriptions.audio_chunk_id = audio_chunks.id
            WHERE 
                audio_transcriptions.transcription LIKE '%' || ?1 || '%'
                AND (?2 IS NULL OR audio_transcriptions.timestamp >= ?2)
                AND (?3 IS NULL OR audio_transcriptions.timestamp <= ?3)
            ORDER BY 
                audio_transcriptions.timestamp DESC
            LIMIT ?4 OFFSET ?5
            "#,
        )
        .bind(query)
        .bind(start_time)
        .bind(end_time)
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

    // Update the count_search_results method
    pub async fn count_search_results(
        &self,
        query: &str,
        content_type: ContentType,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>,
    ) -> Result<usize, sqlx::Error> {
        let mut total_count = 0;

        // If app_name is specified, only count OCR results
        if app_name.is_some() {
            let ocr_count = self
                .count_ocr_results(query, start_time, end_time, app_name)
                .await?;
            total_count += ocr_count;
        } else {
            // If no app_name is specified, proceed with normal counting
            if content_type == ContentType::All || content_type == ContentType::OCR {
                let ocr_count = self
                    .count_ocr_results(query, start_time, end_time, None)
                    .await?;
                total_count += ocr_count;
            }

            if content_type == ContentType::All || content_type == ContentType::Audio {
                let audio_count = self
                    .count_audio_results(query, start_time, end_time)
                    .await?;
                total_count += audio_count;
            }
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
    async fn count_ocr_results(
        &self,
        query: &str,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>,
    ) -> Result<usize, sqlx::Error> {
        let mut sql = r#"
            SELECT COUNT(*)
            FROM ocr_text
            JOIN frames ON ocr_text.frame_id = frames.id
            WHERE text LIKE '%' || ?1 || '%'
                AND (?2 IS NULL OR frames.timestamp >= ?2)
                AND (?3 IS NULL OR frames.timestamp <= ?3)
        "#
        .to_string();

        if app_name.is_some() {
            sql.push_str(" AND frames.app_name = ?4");
        }

        let mut query = sqlx::query_as::<_, (i64,)>(&sql)
            .bind(query)
            .bind(start_time)
            .bind(end_time);

        if let Some(app_name) = app_name {
            query = query.bind(app_name);
        }

        let (count,) = query.fetch_one(&self.pool).await?;
        Ok(count as usize)
    }
    async fn count_audio_results(
        &self,
        query: &str,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
    ) -> Result<usize, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM audio_transcriptions
            WHERE transcription LIKE '%' || ?1 || '%'
                AND (?2 IS NULL OR timestamp >= ?2)
                AND (?3 IS NULL OR timestamp <= ?3)
            "#,
        )
        .bind(query)
        .bind(start_time)
        .bind(end_time)
        .fetch_one(&self.pool)
        .await?;

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
                chunked_text_index.text LIKE '%' || ?1 || '%'
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

    pub async fn get_chunked_data_since_last_request(&self, memory_source: &str, friend_user_id: &str) -> Result<(Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>), DatabaseError> {
        let last_request_info = self.get_last_successful_request_info(memory_source, friend_user_id).await?;
        let (last_chunk_id, last_timestamp) = last_request_info
            .map(|(chunk_range, time_range, _)| {
                let last_chunk_id = chunk_range.split('-').last().unwrap_or("0").parse::<i64>().unwrap_or(0);
                let last_timestamp = DateTime::parse_from_rfc3339(time_range.split('-').last().unwrap_or("1970-01-01T00:00:00Z"))
                    .unwrap_or_else(|_| DateTime::parse_from_rfc3339("1970-01-01T00:00:00Z").unwrap())
                    .with_timezone(&Utc);
                (last_chunk_id, last_timestamp)
            })
            .unwrap_or((0, DateTime::parse_from_rfc3339("1970-01-01T00:00:00Z").unwrap().with_timezone(&Utc)));

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
                    DateTime::parse_from_rfc3339(&row.3).unwrap().with_timezone(&Utc),
                    DateTime::parse_from_rfc3339(&row.4).unwrap().with_timezone(&Utc),
                )
            })
            .map_err(|e| DatabaseError(e.to_string()))
    }

    pub async fn get_last_successful_request_info(&self, memory_source: &str, friend_user_id: &str) -> Result<Option<(String, String, String)>, DatabaseError> {
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
    async fn get_chunked_data_since_last_request(&self, memory_source: &str, friend_user_id: &str) -> Result<(Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>), Box<dyn StdError + Send + Sync>> {
        self.get_chunked_data_since_last_request(memory_source, friend_user_id)
            .await
            .map_err(|e| Box::new(e) as Box<dyn StdError + Send + Sync>)
    }

    async fn get_chunked_data_since_timestamp(&self, memory_source: &str, _friend_user_id: &str, since: DateTime<Utc>) -> Result<(Vec<String>, i64, i64, DateTime<Utc>, DateTime<Utc>), Box<dyn StdError + Send + Sync>> {
        let since_str = since.to_rfc3339();
        let filtered_text = filter_texts(&since_str, memory_source, &self.pool).await?;

        let texts: Vec<String> = filtered_text.split('\n').map(String::from).collect();

        let min_chunk_id = 0;
        let max_chunk_id = texts.len() as i64 - 1;
        let min_timestamp = since;
        let max_timestamp = Utc::now();

        Ok((texts, min_chunk_id, max_chunk_id, min_timestamp, max_timestamp))
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
