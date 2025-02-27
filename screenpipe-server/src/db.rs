use chrono::{DateTime, Utc};
use image::DynamicImage;
use libsqlite3_sys::sqlite3_auto_extension;
use screenpipe_audio::{AudioDevice, DeviceType};
use screenpipe_vision::OcrEngine;
use sqlite_vec::sqlite3_vec_init;
use sqlx::migrate::MigrateDatabase;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use sqlx::Column;
use sqlx::Error as SqlxError;
use sqlx::Row;
use sqlx::TypeInfo;
use sqlx::ValueRef;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, warn};

use std::collections::BTreeMap;

use zerocopy::AsBytes;

use crate::db_types::{
    AudioChunksResponse, AudioEntry, AudioResult, AudioResultRaw, FrameData, FrameRow, OCREntry,
    OCRResult, OCRResultRaw, OcrTextBlock, Order, SearchMatch, Speaker, TagContentType, TextBounds,
    TextPosition,
};
use crate::db_types::{ContentType, UiContent};
use crate::db_types::{SearchResult, TimeSeriesChunk};
use crate::video_utils::VideoMetadata;

use futures::future::try_join_all;

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

        unsafe {
            sqlite3_auto_extension(Some(
                std::mem::transmute::<*const (), unsafe extern "C" fn()>(
                    sqlite3_vec_init as *const (),
                ),
            ));
        }

        // Create the database if it doesn't exist
        if !sqlx::Sqlite::database_exists(&connection_string).await? {
            sqlx::Sqlite::create_database(&connection_string).await?;
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(50)
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
        Self::run_migrations(&db_manager.pool).await?;

        Ok(db_manager)
    }

    async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let mut migrator = sqlx::migrate!("./src/migrations");
        migrator.set_ignore_missing(true);
        match migrator.run(pool).await {
            Ok(_) => Ok(()),
            Err(e) => Err(e.into()),
        }
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

    async fn get_audio_chunk_id(&self, file_path: &str) -> Result<i64, sqlx::Error> {
        let id = sqlx::query_scalar::<_, i64>("SELECT id FROM audio_chunks WHERE file_path = ?1")
            .bind(file_path)
            .fetch_optional(&self.pool)
            .await?;
        Ok(id.unwrap_or(0))
    }

    pub async fn get_or_insert_audio_chunk(&self, file_path: &str) -> Result<i64, sqlx::Error> {
        let mut id = self.get_audio_chunk_id(file_path).await?;
        if id == 0 {
            id = self.insert_audio_chunk(file_path).await?;
        }
        Ok(id)
    }

    pub async fn count_audio_transcriptions(
        &self,
        audio_chunk_id: i64,
    ) -> Result<i64, sqlx::Error> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM audio_transcriptions WHERE audio_chunk_id = ?1",
        )
        .bind(audio_chunk_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(count)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn insert_audio_transcription(
        &self,
        audio_chunk_id: i64,
        transcription: &str,
        offset_index: i64,
        transcription_engine: &str,
        device: &AudioDevice,
        speaker_id: Option<i64>,
        start_time: Option<f64>,
        end_time: Option<f64>,
    ) -> Result<i64, sqlx::Error> {
        let text_length = transcription.len() as i64;
        let mut tx = self.pool.begin().await?;

        // Insert the full transcription
        let id = sqlx::query(
            "INSERT INTO audio_transcriptions (audio_chunk_id, transcription, offset_index, timestamp, transcription_engine, device, is_input_device, speaker_id, start_time, end_time, text_length) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )
        .bind(audio_chunk_id)
        .bind(transcription)
        .bind(offset_index)
        .bind(Utc::now())
        .bind(transcription_engine)
        .bind(&device.name)
        .bind(device.device_type == DeviceType::Input)
        .bind(speaker_id)
        .bind(start_time)
        .bind(end_time)
        .bind(text_length)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        // Commit the transaction for the full transcription
        tx.commit().await?;

        Ok(id)
    }

    pub async fn update_audio_transcription(
        &self,
        audio_chunk_id: i64,
        transcription: &str,
    ) -> Result<i64, sqlx::Error> {
        let text_length = transcription.len() as i64;
        let mut tx = self.pool.begin().await?;

        // Insert the full transcription
        let affected = sqlx::query(
            "UPDATE audio_transcriptions SET transcription = ?1, text_length = ?2 WHERE audio_chunk_id = ?3",
        )
        .bind(transcription)
        .bind(text_length)
        .bind(audio_chunk_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();

        // Commit the transaction for the full transcription
        tx.commit().await?;
        Ok(affected as i64)
    }

    pub async fn insert_speaker(&self, embedding: &[f32]) -> Result<Speaker, SqlxError> {
        let mut tx = self.pool.begin().await?;

        let id = sqlx::query("INSERT INTO speakers (name) VALUES (NULL)")
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

        let bytes: &[u8] = embedding.as_bytes();
        let _ = sqlx::query(
            "INSERT INTO speaker_embeddings (embedding, speaker_id) VALUES (vec_f32(?1), ?2)",
        )
        .bind(bytes)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(Speaker {
            id,
            name: String::new(),
            metadata: String::new(),
        })
    }

    pub async fn update_speaker_metadata(
        &self,
        speaker_id: i64,
        metadata: &str,
    ) -> Result<i64, SqlxError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("UPDATE speakers SET metadata = ?1 WHERE id = ?2")
            .bind(metadata)
            .bind(speaker_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(speaker_id)
    }

    pub async fn get_speaker_by_id(&self, speaker_id: i64) -> Result<Speaker, SqlxError> {
        let speaker = sqlx::query_as("SELECT id, name, metadata FROM speakers WHERE id = ?1")
            .bind(speaker_id)
            .fetch_one(&self.pool)
            .await?;
        Ok(speaker)
    }

    pub async fn get_speaker_from_embedding(
        &self,
        embedding: &[f32],
    ) -> Result<Option<Speaker>, SqlxError> {
        let speaker_threshold = 0.5;
        let bytes: &[u8] = embedding.as_bytes();

        // Using subquery with LIMIT 1 instead of JOIN
        let speaker = sqlx::query_as(
            "SELECT id, name, metadata
             FROM speakers
             WHERE id = (
                 SELECT speaker_id
                 FROM speaker_embeddings
                 WHERE vec_distance_cosine(embedding, vec_f32(?1)) < ?2
                 ORDER BY vec_distance_cosine(embedding, vec_f32(?1))
                 LIMIT 1
             )",
        )
        .bind(bytes)
        .bind(speaker_threshold)
        .fetch_optional(&self.pool)
        .await?;

        Ok(speaker)
    }

    pub async fn update_speaker_name(&self, speaker_id: i64, name: &str) -> Result<i64, SqlxError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("UPDATE speakers SET name = ?1 WHERE id = ?2")
            .bind(name)
            .bind(speaker_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(speaker_id)
    }

    pub async fn insert_video_chunk(
        &self,
        file_path: &str,
        device_name: &str,
    ) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let id = sqlx::query("INSERT INTO video_chunks (file_path, device_name) VALUES (?1, ?2)")
            .bind(file_path)
            .bind(device_name)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();
        tx.commit().await?;
        Ok(id)
    }

    pub async fn insert_frame(
        &self,
        device_name: &str,
        timestamp: Option<DateTime<Utc>>,
        browser_url: Option<&str>,
        app_name: Option<&str>,
        window_name: Option<&str>,
        focused: bool,
    ) -> Result<i64, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        debug!("insert_frame Transaction started");

        // Get the most recent video_chunk_id and file_path
        let video_chunk: Option<(i64, String)> = sqlx::query_as(
            "SELECT id, file_path FROM video_chunks WHERE device_name = ?1 ORDER BY id DESC LIMIT 1",
        )
        .bind(device_name)
        .fetch_optional(&mut *tx)
        .await?;
        debug!("Fetched most recent video_chunk: {:?}", video_chunk);

        // If no video chunk is found, return 0
        let (video_chunk_id, file_path) = match video_chunk {
            Some((id, path)) => (id, path),
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

        let timestamp = timestamp.unwrap_or_else(Utc::now);

        // Insert the new frame with file_path as name and app/window metadata
        let id = sqlx::query(
            "INSERT INTO frames (video_chunk_id, offset_index, timestamp, name, browser_url, app_name, window_name, focused) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(video_chunk_id)
        .bind(offset_index)
        .bind(timestamp)
        .bind(file_path)
        .bind(browser_url)
        .bind(app_name)
        .bind(window_name)
        .bind(focused)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();
        debug!("insert_frame Inserted new frame with id: {}", id);

        // Commit the transaction
        tx.commit().await?;

        Ok(id)
    }

    pub async fn insert_ocr_text(
        &self,
        frame_id: i64,
        text: &str,
        text_json: &str,
        ocr_engine: Arc<OcrEngine>,
    ) -> Result<(), sqlx::Error> {
        let text_length = text.len() as i64;
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO ocr_text (frame_id, text, text_json, ocr_engine, text_length) VALUES (?1, ?2, ?3, ?4, ?5)")
            .bind(frame_id)
            .bind(text)
            .bind(text_json)
            .bind(format!("{:?}", *ocr_engine))
            .bind(text_length)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        debug!("OCR text inserted into db successfully");
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn search(
        &self,
        query: &str,
        mut content_type: ContentType,
        limit: u32,
        offset: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>,
        window_name: Option<&str>,
        min_length: Option<usize>,
        max_length: Option<usize>,
        speaker_ids: Option<Vec<i64>>,
        frame_name: Option<&str>,
        browser_url: Option<&str>,
        focused: Option<bool>,
    ) -> Result<Vec<SearchResult>, sqlx::Error> {
        let mut results = Vec::new();

        // if focused or browser_url is present, we run only on OCR
        if focused.is_some() || browser_url.is_some() {
            content_type = ContentType::OCR;
        }

        match content_type {
            ContentType::All => {
                let (ocr_results, audio_results, ui_results) =
                    if app_name.is_none() && window_name.is_none() && frame_name.is_none() {
                        // Run all three queries in parallel
                        let (ocr, audio, ui) = tokio::try_join!(
                            self.search_ocr(
                                query,
                                limit,
                                offset,
                                start_time,
                                end_time,
                                app_name,
                                window_name,
                                min_length,
                                max_length,
                                frame_name,
                                browser_url,
                                focused,
                            ),
                            self.search_audio(
                                query,
                                limit,
                                offset,
                                start_time,
                                end_time,
                                min_length,
                                max_length,
                                speaker_ids
                            ),
                            self.search_ui_monitoring(
                                query,
                                app_name,
                                window_name,
                                start_time,
                                end_time,
                                limit,
                                offset,
                            )
                        )?;
                        (ocr, Some(audio), ui)
                    } else {
                        // Run only OCR and UI queries in parallel when app/window filters are present
                        let (ocr, ui) = tokio::try_join!(
                            self.search_ocr(
                                query,
                                limit,
                                offset,
                                start_time,
                                end_time,
                                app_name,
                                window_name,
                                min_length,
                                max_length,
                                frame_name,
                                browser_url,
                                focused,
                            ),
                            self.search_ui_monitoring(
                                query,
                                app_name,
                                window_name,
                                start_time,
                                end_time,
                                limit,
                                offset,
                            )
                        )?;
                        (ocr, None, ui)
                    };

                results.extend(ocr_results.into_iter().map(SearchResult::OCR));
                if let Some(audio) = audio_results {
                    results.extend(audio.into_iter().map(SearchResult::Audio));
                }
                results.extend(ui_results.into_iter().map(SearchResult::UI));
            }
            ContentType::OCR => {
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
                        frame_name,
                        browser_url,
                        focused,
                    )
                    .await?;
                results.extend(ocr_results.into_iter().map(SearchResult::OCR));
            }
            ContentType::Audio => {
                if app_name.is_none() && window_name.is_none() {
                    let audio_results = self
                        .search_audio(
                            query,
                            limit,
                            offset,
                            start_time,
                            end_time,
                            min_length,
                            max_length,
                            speaker_ids,
                        )
                        .await?;
                    results.extend(audio_results.into_iter().map(SearchResult::Audio));
                }
            }
            ContentType::UI => {
                let ui_results = self
                    .search_ui_monitoring(
                        query,
                        app_name,
                        window_name,
                        start_time,
                        end_time,
                        limit,
                        offset,
                    )
                    .await?;
                results.extend(ui_results.into_iter().map(SearchResult::UI));
            }
            ContentType::AudioAndUi => {
                let audio_results = self
                    .search_audio(
                        query,
                        limit / 2,
                        offset,
                        start_time,
                        end_time,
                        min_length,
                        max_length,
                        speaker_ids,
                    )
                    .await?;
                let ui_results = self
                    .search_ui_monitoring(
                        query,
                        app_name,
                        window_name,
                        start_time,
                        end_time,
                        limit / 2,
                        offset,
                    )
                    .await?;

                results.extend(audio_results.into_iter().map(SearchResult::Audio));
                results.extend(ui_results.into_iter().map(SearchResult::UI));
            }
            ContentType::OcrAndUi => {
                let ocr_results = self
                    .search_ocr(
                        query,
                        limit / 2,
                        offset,
                        start_time,
                        end_time,
                        app_name,
                        window_name,
                        min_length,
                        max_length,
                        frame_name,
                        browser_url,
                        focused,
                    )
                    .await?;
                let ui_results = self
                    .search_ui_monitoring(
                        query,
                        app_name,
                        window_name,
                        start_time,
                        end_time,
                        limit / 2,
                        offset,
                    )
                    .await?;

                results.extend(ocr_results.into_iter().map(SearchResult::OCR));
                results.extend(ui_results.into_iter().map(SearchResult::UI));
            }
            ContentType::AudioAndOcr => {
                let audio_results = self
                    .search_audio(
                        query,
                        limit / 2,
                        offset,
                        start_time,
                        end_time,
                        min_length,
                        max_length,
                        speaker_ids,
                    )
                    .await?;
                let ocr_results = self
                    .search_ocr(
                        query,
                        limit / 2,
                        offset,
                        start_time,
                        end_time,
                        app_name,
                        window_name,
                        min_length,
                        max_length,
                        frame_name,
                        browser_url,
                        focused,
                    )
                    .await?;

                results.extend(audio_results.into_iter().map(SearchResult::Audio));
                results.extend(ocr_results.into_iter().map(SearchResult::OCR));
            }
        }

        // Sort results by timestamp in descending order
        results.sort_by(|a, b| {
            let timestamp_a = match a {
                SearchResult::OCR(ocr) => ocr.timestamp,
                SearchResult::Audio(audio) => audio.timestamp,
                SearchResult::UI(ui) => ui.timestamp,
            };
            let timestamp_b = match b {
                SearchResult::OCR(ocr) => ocr.timestamp,
                SearchResult::Audio(audio) => audio.timestamp,
                SearchResult::UI(ui) => ui.timestamp,
            };
            timestamp_b.cmp(&timestamp_a)
        });

        // Apply offset and limit after sorting
        results = results
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();

        Ok(results)
    }

    #[allow(clippy::too_many_arguments)]
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
        frame_name: Option<&str>,
        browser_url: Option<&str>,
        focused: Option<bool>,
    ) -> Result<Vec<OCRResult>, sqlx::Error> {
        let mut frame_fts_parts = Vec::new();

        if let Some(app) = app_name {
            if !app.is_empty() {
                frame_fts_parts.push(format!("app_name:{}", app));
            }
        }
        if let Some(window) = window_name {
            if !window.is_empty() {
                frame_fts_parts.push(format!("window_name:{}", window));
            }
        }
        if let Some(browser) = browser_url {
            if !browser.is_empty() {
                frame_fts_parts.push(format!("browser_url:{}", browser));
            }
        }
        if let Some(is_focused) = focused {
            frame_fts_parts.push(format!("focused:{}", if is_focused { "1" } else { "0" }));
        }
        if let Some(frame_name) = frame_name {
            if !frame_name.is_empty() {
                frame_fts_parts.push(format!("name:{}", frame_name));
            }
        }

        let frame_query = frame_fts_parts.join(" ");

        let sql = format!(
            r#"
        SELECT
            ocr_text.frame_id,
            ocr_text.text as ocr_text,
            ocr_text.text_json,
            frames.timestamp,
            frames.name as frame_name,
            video_chunks.file_path,
            frames.offset_index,
            frames.app_name,
            ocr_text.ocr_engine,
            frames.window_name,
            GROUP_CONCAT(tags.name, ',') as tags,
            frames.browser_url,
            frames.focused
        FROM frames
        JOIN video_chunks ON frames.video_chunk_id = video_chunks.id
        JOIN ocr_text ON frames.id = ocr_text.frame_id
        LEFT JOIN vision_tags ON frames.id = vision_tags.vision_id
        LEFT JOIN tags ON vision_tags.tag_id = tags.id
        {frame_fts_join}
        {ocr_fts_join}
        WHERE 1=1
            {frame_fts_condition}
            {ocr_fts_condition}
            AND (?2 IS NULL OR frames.timestamp >= ?2)
            AND (?3 IS NULL OR frames.timestamp <= ?3)
            AND (?4 IS NULL OR COALESCE(ocr_text.text_length, LENGTH(ocr_text.text)) >= ?4)
            AND (?5 IS NULL OR COALESCE(ocr_text.text_length, LENGTH(ocr_text.text)) <= ?5)
        GROUP BY frames.id
        ORDER BY frames.timestamp DESC
        LIMIT ?7 OFFSET ?8
        "#,
            frame_fts_join = if frame_query.trim().is_empty() {
                ""
            } else {
                "JOIN frames_fts ON frames.id = frames_fts.id"
            },
            ocr_fts_join = if query.trim().is_empty() {
                ""
            } else {
                "JOIN ocr_text_fts ON ocr_text.frame_id = ocr_text_fts.frame_id"
            },
            frame_fts_condition = if frame_query.trim().is_empty() {
                ""
            } else {
                "AND frames_fts MATCH ?1"
            },
            ocr_fts_condition = if query.trim().is_empty() {
                ""
            } else {
                "AND ocr_text_fts MATCH ?6"
            }
        );

        let query_builder = sqlx::query_as(&sql);

        let raw_results: Vec<OCRResultRaw> = query_builder
            .bind(if frame_query.trim().is_empty() {
                None
            } else {
                Some(&frame_query)
            })
            .bind(start_time)
            .bind(end_time)
            .bind(min_length.map(|l| l as i64))
            .bind(max_length.map(|l| l as i64))
            .bind(if query.trim().is_empty() {
                None
            } else {
                Some(query)
            })
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

        Ok(raw_results
            .into_iter()
            .map(|raw| OCRResult {
                frame_id: raw.frame_id,
                ocr_text: raw.ocr_text,
                text_json: raw.text_json,
                timestamp: raw.timestamp,
                frame_name: raw.frame_name,
                file_path: raw.file_path,
                offset_index: raw.offset_index,
                app_name: raw.app_name,
                ocr_engine: raw.ocr_engine,
                window_name: raw.window_name,
                tags: raw
                    .tags
                    .map(|t| t.split(',').map(String::from).collect())
                    .unwrap_or_default(),
                browser_url: raw.browser_url,
                focused: raw.focused,
            })
            .collect())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn search_audio(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        min_length: Option<usize>,
        max_length: Option<usize>,
        speaker_ids: Option<Vec<i64>>,
    ) -> Result<Vec<AudioResult>, sqlx::Error> {
        // base query for audio search
        let mut base_sql = String::from(
            "SELECT
                audio_transcriptions.audio_chunk_id,
                audio_transcriptions.transcription,
                audio_transcriptions.timestamp,
                audio_chunks.file_path,
                audio_transcriptions.offset_index,
                audio_transcriptions.transcription_engine,
                GROUP_CONCAT(tags.name, ',') as tags,
                audio_transcriptions.device as device_name,
                audio_transcriptions.is_input_device,
                audio_transcriptions.speaker_id,
                audio_transcriptions.start_time,
                audio_transcriptions.end_time
             FROM audio_transcriptions
             JOIN audio_chunks ON audio_transcriptions.audio_chunk_id = audio_chunks.id
             LEFT JOIN speakers ON audio_transcriptions.speaker_id = speakers.id
             LEFT JOIN audio_tags ON audio_chunks.id = audio_tags.audio_chunk_id
             LEFT JOIN tags ON audio_tags.tag_id = tags.id",
        );
        // if query is provided, join the corresponding fts table
        if !query.is_empty() {
            base_sql.push_str(" JOIN audio_transcriptions_fts ON audio_transcriptions_fts.audio_chunk_id = audio_transcriptions.audio_chunk_id");
        }

        // build where clause conditions in order
        let mut conditions = Vec::new();
        if !query.is_empty() {
            conditions.push("audio_transcriptions_fts MATCH ?");
        }
        if start_time.is_some() {
            conditions.push("audio_transcriptions.timestamp >= ?");
        }
        if end_time.is_some() {
            conditions.push("audio_transcriptions.timestamp <= ?");
        }
        if min_length.is_some() {
            conditions.push("COALESCE(audio_transcriptions.text_length, LENGTH(audio_transcriptions.transcription)) >= ?");
        }
        if max_length.is_some() {
            conditions.push("COALESCE(audio_transcriptions.text_length, LENGTH(audio_transcriptions.transcription)) <= ?");
        }
        conditions.push("(speakers.id IS NULL OR speakers.hallucination = 0)");
        if speaker_ids.is_some() {
            conditions.push("(json_array_length(?) = 0 OR audio_transcriptions.speaker_id IN (SELECT value FROM json_each(?)))");
        }

        let where_clause = if conditions.is_empty() {
            "WHERE 1=1".to_owned()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        // complete sql with group, order, limit and offset
        let sql = format!(
            "{} {} GROUP BY audio_transcriptions.audio_chunk_id, audio_transcriptions.offset_index ORDER BY audio_transcriptions.timestamp DESC LIMIT ? OFFSET ?",
            base_sql, where_clause
        );

        // prepare binding for speaker_ids (if any)
        let speaker_ids_json = speaker_ids.as_ref().map_or_else(
            || "[]".to_string(),
            |ids| serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string()),
        );

        let mut query_builder = sqlx::query_as::<_, AudioResultRaw>(&sql);

        // bind parameters in the same order as added to the where clause
        if !query.is_empty() {
            query_builder = query_builder.bind(query);
        }
        if let Some(start) = start_time {
            query_builder = query_builder.bind(start);
        }
        if let Some(end) = end_time {
            query_builder = query_builder.bind(end);
        }
        if let Some(min) = min_length {
            query_builder = query_builder.bind(min as i64);
        }
        if let Some(max) = max_length {
            query_builder = query_builder.bind(max as i64);
        }
        if speaker_ids.is_some() {
            query_builder = query_builder
                .bind(&speaker_ids_json)
                .bind(&speaker_ids_json);
        }
        query_builder = query_builder.bind(limit as i64).bind(offset as i64);

        let results_raw: Vec<AudioResultRaw> = query_builder.fetch_all(&self.pool).await?;

        // map raw results into audio result type
        let futures: Vec<_> = results_raw
            .into_iter()
            .map(|raw| async move {
                let speaker = match raw.speaker_id {
                    Some(id) => match self.get_speaker_by_id(id).await {
                        Ok(speaker) => Some(speaker),
                        Err(_) => None,
                    },
                    None => None,
                };

                Ok::<AudioResult, sqlx::Error>(AudioResult {
                    audio_chunk_id: raw.audio_chunk_id,
                    transcription: raw.transcription,
                    timestamp: raw.timestamp,
                    file_path: raw.file_path,
                    offset_index: raw.offset_index,
                    transcription_engine: raw.transcription_engine,
                    tags: raw
                        .tags
                        .map(|s| s.split(',').map(|s| s.to_owned()).collect())
                        .unwrap_or_default(),
                    device_name: raw.device_name,
                    device_type: if raw.is_input_device {
                        DeviceType::Input
                    } else {
                        DeviceType::Output
                    },
                    speaker,
                    start_time: raw.start_time,
                    end_time: raw.end_time,
                })
            })
            .collect();

        Ok(try_join_all(futures).await?.into_iter().collect())
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

    #[allow(clippy::too_many_arguments)]
    pub async fn count_search_results(
        &self,
        query: &str,
        mut content_type: ContentType,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        app_name: Option<&str>,
        window_name: Option<&str>,
        min_length: Option<usize>,
        max_length: Option<usize>,
        speaker_ids: Option<Vec<i64>>,
        frame_name: Option<&str>,
        browser_url: Option<&str>,
        focused: Option<bool>,
    ) -> Result<usize, sqlx::Error> {

        // if focused or browser_url is present, we run only on OCR
        if focused.is_some() || browser_url.is_some() {
            content_type = ContentType::OCR;
        }

        if content_type == ContentType::All {
            // Create boxed futures to avoid infinite size issues with recursion
            let ocr_future = Box::pin(self.count_search_results(
                query,
                ContentType::OCR,
                start_time,
                end_time,
                app_name,
                window_name,
                min_length,
                max_length,
                None,
                frame_name,
                browser_url,
                focused,
            ));

            let ui_future = Box::pin(self.count_search_results(
                query,
                ContentType::UI,
                start_time,
                end_time,
                app_name,
                window_name,
                min_length,
                max_length,
                None,
                None,
                None,
                None,
            ));

            if app_name.is_none() && window_name.is_none() {
                let audio_future = Box::pin(self.count_search_results(
                    query,
                    ContentType::Audio,
                    start_time,
                    end_time,
                    None,
                    None,
                    min_length,
                    max_length,
                    speaker_ids,
                    None,
                    None,
                    None,
                ));

                let (ocr_count, audio_count, ui_count) =
                    tokio::try_join!(ocr_future, audio_future, ui_future)?;
                return Ok(ocr_count + audio_count + ui_count);
            } else {
                let (ocr_count, ui_count) = tokio::try_join!(ocr_future, ui_future)?;
                return Ok(ocr_count + ui_count);
            }
        }

        let json_array = if let Some(ids) = speaker_ids {
            if !ids.is_empty() {
                serde_json::to_string(&ids).unwrap_or_default()
            } else {
                "[]".to_string()
            }
        } else {
            "[]".to_string()
        };
        // Build frame and OCR FTS queries
        let mut frame_fts_parts = Vec::new();
        let mut ocr_fts_parts = Vec::new();
        let mut ui_fts_parts = Vec::new();

        // Split query parts between frame metadata and OCR content
        if !query.is_empty() {
            ocr_fts_parts.push(query.to_owned()); // Just use the query directly
            ui_fts_parts.push(query.to_owned());
        }
        if let Some(app) = app_name {
            if !app.is_empty() {
                frame_fts_parts.push(format!("app_name:{}", app));
                ui_fts_parts.push(format!("app:\"{}\"", app));
            }
        }
        if let Some(window) = window_name {
            if !window.is_empty() {
                frame_fts_parts.push(format!("window_name:{}", window));
                ui_fts_parts.push(format!("window:\"{}\"", window));
            }
        }
        if let Some(browser) = browser_url {
            if !browser.is_empty() {
                frame_fts_parts.push(format!("browser_url:{}", browser));
            }
        }
        if let Some(is_focused) = focused {
            frame_fts_parts.push(format!("focused:{}", if is_focused { "1" } else { "0" }));
        }

        let frame_query = frame_fts_parts.join(" ");
        let ocr_query = ocr_fts_parts.join(" ");
        let ui_query = ui_fts_parts.join(" ");

        let sql = match content_type {
            ContentType::OCR => format!(
                r#"SELECT COUNT(DISTINCT frames.id)
                   FROM {base_table}
                   WHERE {where_clause}
                       AND (?2 IS NULL OR frames.timestamp >= ?2)
                       AND (?3 IS NULL OR frames.timestamp <= ?3)
                       AND (?4 IS NULL OR COALESCE(ocr_text.text_length, LENGTH(ocr_text.text)) >= ?4)
                       AND (?5 IS NULL OR COALESCE(ocr_text.text_length, LENGTH(ocr_text.text)) <= ?5)
                       AND (?6 IS NULL OR frames.name LIKE '%' || ?6 || '%')"#,
                base_table = if ocr_query.is_empty() {
                    "frames
                     JOIN ocr_text ON frames.id = ocr_text.frame_id"
                } else {
                    "ocr_text_fts
                     JOIN ocr_text ON ocr_text_fts.frame_id = ocr_text.frame_id
                     JOIN frames ON ocr_text.frame_id = frames.id"
                },
                where_clause = if ocr_query.is_empty() {
                    "1=1"
                } else {
                    "ocr_text_fts MATCH ?1"
                }
            ),
            ContentType::UI => format!(
                r#"SELECT COUNT(DISTINCT ui_monitoring.id)
                   FROM {table}
                   WHERE {match_condition}
                       AND (?2 IS NULL OR timestamp >= ?2)
                       AND (?3 IS NULL OR timestamp <= ?3)
                       AND (?4 IS NULL OR COALESCE(text_length, LENGTH(ui_monitoring.text_output)) >= ?4)
                       AND (?5 IS NULL OR COALESCE(text_length, LENGTH(ui_monitoring.text_output)) <= ?5)"#,
                table = if ui_query.is_empty() {
                    "ui_monitoring"
                } else {
                    "ui_monitoring_fts JOIN ui_monitoring ON ui_monitoring_fts.ui_id = ui_monitoring.id"
                },
                match_condition = if ui_query.is_empty() {
                    "1=1"
                } else {
                    "ui_monitoring_fts MATCH ?1"
                }
            ),
            ContentType::Audio => format!(
                r#"SELECT COUNT(DISTINCT audio_transcriptions.id)
                   FROM {table}
                   WHERE {match_condition}
                       AND (?2 IS NULL OR audio_transcriptions.timestamp >= ?2)
                       AND (?3 IS NULL OR audio_transcriptions.timestamp <= ?3)
                       AND (?4 IS NULL OR COALESCE(audio_transcriptions.text_length, LENGTH(audio_transcriptions.transcription)) >= ?4)
                       AND (?5 IS NULL OR COALESCE(audio_transcriptions.text_length, LENGTH(audio_transcriptions.transcription)) <= ?5)
                       AND (json_array_length(?6) = 0 OR audio_transcriptions.speaker_id IN (SELECT value FROM json_each(?6)))
                "#,
                table = if query.is_empty() {
                    "audio_transcriptions"
                } else {
                    "audio_transcriptions_fts JOIN audio_transcriptions ON audio_transcriptions_fts.audio_chunk_id = audio_transcriptions.audio_chunk_id"
                },
                match_condition = if query.is_empty() {
                    "1=1"
                } else {
                    "audio_transcriptions_fts MATCH ?1"
                }
            ),
            _ => return Ok(0),
        };

        let count: i64 = match content_type {
            ContentType::OCR => {
                sqlx::query_scalar(&sql)
                    .bind(if frame_query.is_empty() && ocr_query.is_empty() {
                        "*".to_owned()
                    } else if frame_query.is_empty() {
                        ocr_query
                    } else {
                        frame_query
                    })
                    .bind(start_time)
                    .bind(end_time)
                    .bind(min_length.map(|l| l as i64))
                    .bind(max_length.map(|l| l as i64))
                    .bind(frame_name)
                    .fetch_one(&self.pool)
                    .await?
            }
            ContentType::UI => {
                sqlx::query_scalar(&sql)
                    .bind(if ui_query.is_empty() { "*" } else { &ui_query })
                    .bind(start_time)
                    .bind(end_time)
                    .bind(min_length.map(|l| l as i64))
                    .bind(max_length.map(|l| l as i64))
                    .fetch_one(&self.pool)
                    .await?
            }
            ContentType::Audio => {
                sqlx::query_scalar(&sql)
                    .bind(if query.is_empty() { "*" } else { query })
                    .bind(start_time)
                    .bind(end_time)
                    .bind(min_length.map(|l| l as i64))
                    .bind(max_length.map(|l| l as i64))
                    .bind(json_array)
                    .fetch_one(&self.pool)
                    .await?
            }
            _ => {
                sqlx::query_scalar(&sql)
                    .bind(query)
                    .bind(start_time)
                    .bind(end_time)
                    .bind(min_length.map(|l| l as i64))
                    .bind(max_length.map(|l| l as i64))
                    .bind(json_array)
                    .fetch_one(&self.pool)
                    .await?
            }
        };

        Ok(count as usize)
    }

    pub async fn get_latest_timestamps(
        &self,
    ) -> Result<
        (
            Option<DateTime<Utc>>,
            Option<DateTime<Utc>>,
            Option<DateTime<Utc>>,
        ),
        sqlx::Error,
    > {
        let latest_frame: Option<(DateTime<Utc>,)> =
            sqlx::query_as("SELECT timestamp FROM frames ORDER BY timestamp DESC LIMIT 1")
                .fetch_optional(&self.pool)
                .await?;

        let latest_audio: Option<(DateTime<Utc>,)> =
            sqlx::query_as("SELECT timestamp FROM audio_chunks ORDER BY timestamp DESC LIMIT 1")
                .fetch_optional(&self.pool)
                .await?;

        // Check if ui_monitoring table exists first
        let latest_ui: Option<(DateTime<Utc>,)> = match sqlx::query_scalar::<_, i32>(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ui_monitoring'",
        )
        .fetch_optional(&self.pool)
        .await?
        {
            Some(_) => {
                sqlx::query_as(
                    "SELECT timestamp FROM ui_monitoring ORDER BY timestamp DESC LIMIT 1",
                )
                .fetch_optional(&self.pool)
                .await?
            }
            None => {
                debug!("ui_monitoring table does not exist");
                None
            }
        };

        Ok((
            latest_frame.map(|f| f.0),
            latest_audio.map(|a| a.0),
            latest_ui.map(|u| u.0),
        ))
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

    pub async fn find_video_chunks(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<TimeSeriesChunk, SqlxError> {
        // Get frames with OCR data, grouped by minute to handle multiple monitors
        let frames_query = r#"
         SELECT
            f.id,
            f.timestamp,
            f.offset_index,
            ot.text,
            COALESCE(f.app_name, ot.app_name) as app_name,
            COALESCE(f.window_name, ot.window_name) as window_name,
            vc.device_name as screen_device,
            vc.file_path as video_path
        FROM frames f
        JOIN video_chunks vc ON f.video_chunk_id = vc.id
        LEFT JOIN ocr_text ot ON f.id = ot.frame_id
        WHERE f.timestamp >= ?1 AND f.timestamp <= ?2
        ORDER BY f.timestamp DESC, f.offset_index DESC
    "#;

        // Get audio data with proper time windows for synchronization
        let audio_query = r#"
        SELECT
            at.timestamp,
            at.transcription,
            at.device as audio_device,
            at.is_input_device,
            ac.file_path as audio_path,
            at.start_time,
            at.end_time,
            CAST((julianday(datetime(at.timestamp, '+' || at.end_time || ' seconds')) -
                  julianday(datetime(at.timestamp, '+' || at.start_time || ' seconds'))) * 86400
                 as REAL) as duration_secs
        FROM audio_transcriptions at
        JOIN audio_chunks ac ON at.audio_chunk_id = ac.id
        WHERE at.timestamp >= ?1 AND at.timestamp <= ?2
        ORDER BY at.timestamp DESC
        "#;

        // Execute queries in parallel
        let (frame_rows, audio_rows) = tokio::try_join!(
            sqlx::query(frames_query)
                .bind(start)
                .bind(end)
                .fetch_all(&self.pool),
            sqlx::query(audio_query)
                .bind(start)
                .bind(end)
                .fetch_all(&self.pool)
        )?;

        // Process into structured data with device-aware grouping
        let mut frames_map: BTreeMap<(DateTime<Utc>, i64), FrameData> = BTreeMap::new();

        // Process frame/OCR data with device awareness
        for row in frame_rows {
            let timestamp: DateTime<Utc> = row.get("timestamp");
            let offset_index: i64 = row.get("offset_index");
            let key = (timestamp, offset_index);

            let frame_data = frames_map.entry(key).or_insert_with(|| FrameData {
                frame_id: row.get("id"),
                timestamp,
                offset_index,
                ocr_entries: Vec::new(),
                audio_entries: Vec::new(),
            });

            if let Ok(text) = row.try_get::<String, _>("text") {
                frame_data.ocr_entries.push(OCREntry {
                    text,
                    app_name: row.get("app_name"),
                    window_name: row.get("window_name"),
                    device_name: row.get("screen_device"),
                    video_file_path: row.get("video_path"),
                });
            }
        }

        // Process audio data with proper synchronization
        for row in audio_rows {
            let timestamp: DateTime<Utc> = row.get("timestamp");

            // Find the closest frame
            if let Some((&key, _)) = frames_map
                .range(..=(timestamp, i64::MAX))
                .next_back()
                .or_else(|| frames_map.iter().next())
            {
                if let Some(frame_data) = frames_map.get_mut(&key) {
                    frame_data.audio_entries.push(AudioEntry {
                        transcription: row.get("transcription"),
                        device_name: row.get("audio_device"),
                        is_input: row.get("is_input_device"),
                        audio_file_path: row.get("audio_path"),
                        duration_secs: row.get("duration_secs"),
                    });
                }
            }
        }

        Ok(TimeSeriesChunk {
            frames: frames_map.into_values().rev().collect(),
            start_time: start,
            end_time: end,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn search_ui_monitoring(
        &self,
        query: &str,
        app_name: Option<&str>,
        window_name: Option<&str>,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<UiContent>, sqlx::Error> {
        // combine search aspects into single fts query
        let mut fts_parts = Vec::new();
        if !query.is_empty() {
            fts_parts.push(query.to_owned());
        }
        if let Some(app) = app_name {
            fts_parts.push(format!("app:{}", app));
        }
        if let Some(window) = window_name {
            fts_parts.push(format!("window:{}", window));
        }
        let combined_query = fts_parts.join(" ");

        let base_sql = if combined_query.is_empty() {
            "ui_monitoring"
        } else {
            "ui_monitoring_fts JOIN ui_monitoring ON ui_monitoring_fts.ui_id = ui_monitoring.id"
        };

        let where_clause = if combined_query.is_empty() {
            "WHERE 1=1"
        } else {
            "WHERE ui_monitoring_fts MATCH ?1"
        };

        let sql = format!(
            r#"
            SELECT
                ui_monitoring.id,
                ui_monitoring.text_output,
                ui_monitoring.timestamp,
                ui_monitoring.app as app_name,
                ui_monitoring.window as window_name,
                ui_monitoring.initial_traversal_at,
                video_chunks.file_path,
                frames.offset_index,
                frames.name as frame_name,
                frames.browser_url
            FROM {}
            LEFT JOIN frames ON
                frames.timestamp BETWEEN
                    datetime(ui_monitoring.timestamp, '-1 seconds')
                    AND datetime(ui_monitoring.timestamp, '+1 seconds')
            LEFT JOIN video_chunks ON frames.video_chunk_id = video_chunks.id
            {}
                AND (?2 IS NULL OR ui_monitoring.timestamp >= ?2)
                AND (?3 IS NULL OR ui_monitoring.timestamp <= ?3)
            GROUP BY ui_monitoring.id
            ORDER BY ui_monitoring.timestamp DESC
            LIMIT ?4 OFFSET ?5
            "#,
            base_sql, where_clause
        );

        sqlx::query_as(&sql)
            .bind(if combined_query.is_empty() {
                "*".to_owned()
            } else {
                combined_query
            })
            .bind(start_time)
            .bind(end_time)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
    }

    // Add tags to UI monitoring entry
    pub async fn add_tags_to_ui_monitoring(
        &self,
        ui_monitoring_id: i64,
        tag_ids: &[i64],
    ) -> Result<(), anyhow::Error> {
        for tag_id in tag_ids {
            sqlx::query(
                "INSERT OR IGNORE INTO ui_monitoring_tags (ui_monitoring_id, tag_id) VALUES (?, ?)",
            )
            .bind(ui_monitoring_id)
            .bind(tag_id)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    // Get tags for UI monitoring entry
    pub async fn get_ui_monitoring_tags(
        &self,
        ui_monitoring_id: i64,
    ) -> Result<Vec<String>, anyhow::Error> {
        let tags = sqlx::query_as::<_, (String,)>(
            "SELECT t.name FROM tags t
             JOIN ui_monitoring_tags ut ON t.id = ut.tag_id
             WHERE ut.ui_monitoring_id = ?",
        )
        .bind(ui_monitoring_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(tags.into_iter().map(|t| t.0).collect())
    }

    pub async fn get_audio_chunks_for_speaker(
        &self,
        speaker_id: i64,
    ) -> Result<Vec<AudioChunksResponse>, sqlx::Error> {
        sqlx::query_as::<_, AudioChunksResponse>(
            r#"
            SELECT
                ac.*,
                at.start_time,
                at.end_time,
                ac.file_path
            FROM audio_chunks ac
            JOIN audio_transcriptions at ON ac.id = at.audio_chunk_id
            WHERE at.speaker_id = ?
            ORDER BY at.start_time
            "#,
        )
        .bind(speaker_id)
        .fetch_all(&self.pool)
        .await
    }

    // get unnamed speakers
    pub async fn get_unnamed_speakers(
        &self,
        limit: u32,
        offset: u32,
        speaker_ids: Option<Vec<i64>>,
    ) -> Result<Vec<Speaker>, sqlx::Error> {
        let base_query = r#"
            WITH RecentAudioPaths AS (
                SELECT DISTINCT
                    s.id as speaker_id,
                    ac.file_path,
                    at.transcription,
                    at.start_time,
                    at.end_time
                FROM speakers s
                JOIN audio_transcriptions at ON s.id = at.speaker_id
                JOIN audio_chunks ac ON at.audio_chunk_id = ac.id
                WHERE (s.name = '' OR s.name IS NULL)
                AND s.hallucination = 0
                "#;

        let speaker_filter = match &speaker_ids {
            Some(ids) if !ids.is_empty() => {
                let placeholders = vec!["?"; ids.len()].join(",");
                format!("AND s.id IN ({})", placeholders)
            }
            _ => String::new(),
        };

        let query = format!(
            r#"{}
                {}
                AND at.timestamp IN (
                    SELECT timestamp
                    FROM audio_transcriptions at2
                    WHERE at2.speaker_id = s.id
                    ORDER BY timestamp DESC
                    LIMIT 3
                )
            )
            SELECT
                s.id,
                s.name,
                CASE
                    WHEN s.metadata = '' OR s.metadata IS NULL OR json_valid(s.metadata) = 0
                    THEN json_object('audio_samples', json_group_array(
                        DISTINCT json_object(
                            'path', rap.file_path,
                            'transcript', rap.transcription,
                            'start_time', rap.start_time,
                            'end_time', rap.end_time
                        )
                    ))
                    ELSE json_patch(
                        json(s.metadata),
                        json_object('audio_samples', json_group_array(
                            DISTINCT json_object(
                                'path', rap.file_path,
                                'transcript', rap.transcription,
                                'start_time', rap.start_time,
                                'end_time', rap.end_time
                            )
                        ))
                    )
                END as metadata,
                COUNT(at.id) as transcription_count
            FROM speakers s
            JOIN RecentAudioPaths rap ON s.id = rap.speaker_id
            JOIN audio_transcriptions at ON s.id = at.speaker_id
            GROUP BY s.id
            ORDER BY transcription_count DESC
            LIMIT ? OFFSET ?
            "#,
            base_query, speaker_filter
        );

        let mut db_query = sqlx::query_as::<sqlx::Sqlite, Speaker>(&query);

        // Add speaker_id bindings if present
        if let Some(ids) = speaker_ids {
            for id in ids {
                db_query = db_query.bind(id);
            }
        }

        // Add limit and offset last
        db_query = db_query.bind(limit).bind(offset);

        let res = db_query.fetch_all(&self.pool).await?;
        Ok(res)
    }

    pub async fn merge_speakers(
        &self,
        speaker_to_keep_id: i64,
        speaker_to_merge_id: i64,
    ) -> Result<Speaker, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // for each audio transcription of the speaker to merge, update the speaker_id to the speaker to keep
        sqlx::query("UPDATE audio_transcriptions SET speaker_id = ? WHERE speaker_id = ?")
            .bind(speaker_to_keep_id)
            .bind(speaker_to_merge_id)
            .execute(&mut *tx)
            .await?;

        // update speaker_embeddings
        sqlx::query("UPDATE speaker_embeddings SET speaker_id = ? WHERE speaker_id = ?")
            .bind(speaker_to_keep_id)
            .bind(speaker_to_merge_id)
            .execute(&mut *tx)
            .await?;

        // delete the speaker to merge
        sqlx::query("DELETE FROM speakers WHERE id = ?")
            .bind(speaker_to_merge_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        self.get_speaker_by_id(speaker_to_keep_id).await
    }

    pub async fn search_speakers(&self, name_prefix: &str) -> Result<Vec<Speaker>, sqlx::Error> {
        sqlx::query_as::<_, Speaker>(
            "SELECT DISTINCT * FROM speakers WHERE name LIKE ? || '%' AND hallucination = 0",
        )
        .bind(name_prefix)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn delete_speaker(&self, id: i64) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // Array of (query, operation description) tuples
        let operations = [
            (
                "DELETE FROM audio_transcriptions WHERE speaker_id = ?",
                "audio transcriptions",
            ),
            (
                "DELETE FROM audio_chunks WHERE id IN (SELECT audio_chunk_id FROM audio_transcriptions WHERE speaker_id = ? AND start_time IS NULL)",
                "audio chunks",
            ),
            (
                "DELETE FROM speaker_embeddings WHERE speaker_id = ?",
                "speaker embeddings",
            ),
            (
                "DELETE FROM speakers WHERE id = ?",
                "speaker",
            ),
        ];

        // Execute each deletion operation
        for (query, operation) in operations {
            if let Err(e) = sqlx::query(query).bind(id).execute(&mut *tx).await {
                error!("Failed to delete {} for speaker {}: {}", operation, id, e);
                tx.rollback().await?;
                return Err(e);
            }
            debug!("Successfully deleted {} for speaker {}", operation, id);
        }

        tx.commit().await.map_err(|e| {
            error!("Failed to commit speaker deletion transaction: {}", e);
            e
        })?;

        debug!("Successfully committed speaker deletion transaction");
        Ok(())
    }

    pub async fn get_similar_speakers(
        &self,
        speaker_id: i64,
        limit: u32,
    ) -> Result<Vec<Speaker>, sqlx::Error> {
        let threshold = 0.8;

        sqlx::query_as::<sqlx::Sqlite, Speaker>(
            r#"
            WITH RecentAudioPaths AS (
                SELECT DISTINCT
                    s.id as speaker_id,
                    ac.file_path,
                    at.transcription,
                    at.start_time,
                    at.end_time
                FROM speakers s
                JOIN audio_transcriptions at ON s.id = at.speaker_id
                JOIN audio_chunks ac ON at.audio_chunk_id = ac.id
                AND s.hallucination = 0
                AND at.timestamp IN (
                    SELECT timestamp
                    FROM audio_transcriptions at2
                    WHERE at2.speaker_id = s.id
                    ORDER BY timestamp DESC
                    LIMIT 3
                )
            ),
            speaker_embedding AS (
                SELECT embedding FROM speaker_embeddings WHERE speaker_id = ?1
            )
            SELECT
                s.id,
                s.name,
                CASE
                    WHEN s.metadata = '' OR s.metadata IS NULL OR json_valid(s.metadata) = 0
                    THEN json_object('audio_samples', json_group_array(DISTINCT json_object(
                        'path', rap.file_path,
                        'transcript', rap.transcription,
                        'start_time', rap.start_time,
                        'end_time', rap.end_time
                    )))
                    ELSE json_patch(
                        json(s.metadata),
                        json_object('audio_samples', json_group_array(DISTINCT json_object(
                            'path', rap.file_path,
                            'transcript', rap.transcription,
                            'start_time', rap.start_time,
                            'end_time', rap.end_time
                        )))
                    )
                END as metadata
            FROM speaker_embeddings se
            JOIN speakers s ON se.speaker_id = s.id
            JOIN RecentAudioPaths rap ON s.id = rap.speaker_id
            WHERE vec_distance_cosine(se.embedding, (SELECT embedding FROM speaker_embedding)) < ?2
            AND se.speaker_id != ?1
            GROUP BY s.id
            ORDER BY vec_distance_cosine(se.embedding, (SELECT embedding FROM speaker_embedding))
            LIMIT ?3"#,
        )
        .bind(speaker_id)
        .bind(threshold)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn mark_speaker_as_hallucination(&self, id: i64) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE speakers SET hallucination = TRUE WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn create_video_with_frames(
        &self,
        file_path: &str,
        frames: Vec<DynamicImage>,
        metadata: VideoMetadata,
    ) -> Result<Vec<i64>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        debug!(
            "creating video chunk {}, metadata: {:?}",
            &file_path, &metadata
        );

        // Use metadata.device_name or default to "imported_files"
        let device_name = metadata
            .device_name
            .unwrap_or_else(|| "imported_files".to_string());

        let video_chunk_id =
            sqlx::query("INSERT INTO video_chunks (device_name, file_path) VALUES (?1, ?2)")
                .bind(device_name)
                .bind(file_path)
                .execute(&mut *tx)
                .await?
                .last_insert_rowid();

        // 2. Create frames with correct timestamps and default name
        let mut frame_ids = Vec::with_capacity(frames.len());

        for (i, _frame) in frames.iter().enumerate() {
            let frame_timestamp = metadata.creation_time
                + chrono::Duration::milliseconds((i as f64 * (1000.0 / metadata.fps)) as i64);

            debug!("frame timestamp: {}", frame_timestamp);

            let frame_id = sqlx::query(
                "INSERT INTO frames (video_chunk_id, offset_index, timestamp, name) VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(video_chunk_id)
            .bind(i as i64)
            .bind(frame_timestamp)
            .bind(metadata.name.as_deref().unwrap_or(file_path))  // Use reference instead of clone
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

            frame_ids.push(frame_id);
        }

        tx.commit().await?;
        debug!(
            "created {} frames for video chunk {}",
            frames.len(),
            video_chunk_id
        );

        Ok(frame_ids)
    }

    pub async fn insert_embeddings(
        &self,
        frame_id: i64,
        embedding: String,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO ocr_text_embeddings (frame_id, embedding) VALUES (?1, ?2)")
            .bind(frame_id)
            .bind(embedding)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn search_similar_embeddings(
        &self,
        embedding: Vec<f32>,
        limit: u32,
        threshold: f32,
    ) -> Result<Vec<OCRResult>, sqlx::Error> {
        debug!("searching similar embeddings with threshold {}", threshold);

        let sql = r#"
            WITH embedding_matches AS (
                SELECT
                    frame_id,
                    vec_distance_cosine(embedding, vec_f32(?1)) as similarity
                FROM ocr_text_embeddings
                WHERE vec_distance_cosine(embedding, vec_f32(?1)) < ?2
                ORDER BY similarity ASC
                LIMIT ?3
            )
            SELECT
                ocr_text.frame_id,
                ocr_text.text as ocr_text,
                ocr_text.text_json,
                frames.timestamp,
                video_chunks.file_path,
                frames.offset_index,
                frames.name as frame_name,
                frames.app_name,
                ocr_text.ocr_engine,
                frames.window_name,
                GROUP_CONCAT(tags.name, ',') as tags,
                frames.browser_url
            FROM embedding_matches
            JOIN ocr_text ON embedding_matches.frame_id = ocr_text.frame_id
            JOIN frames ON ocr_text.frame_id = frames.id
            JOIN video_chunks ON frames.video_chunk_id = video_chunks.id
            LEFT JOIN vision_tags ON frames.id = vision_tags.vision_id
            LEFT JOIN tags ON vision_tags.tag_id = tags.id
            GROUP BY ocr_text.frame_id
            ORDER BY embedding_matches.similarity ASC
        "#;

        let bytes = embedding.as_bytes();

        let raw_results: Vec<OCRResultRaw> = sqlx::query_as(sql)
            .bind(bytes)
            .bind(threshold)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;

        Ok(raw_results
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
                frame_name: raw.frame_name,
                tags: raw
                    .tags
                    .map(|t| t.split(',').map(String::from).collect())
                    .unwrap_or_default(),
                browser_url: raw.browser_url,
                focused: raw.focused,
            })
            .collect())
    }

    // Add method to update frame names
    pub async fn update_frame_name(&self, frame_id: i64, name: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE frames SET name = ?1 WHERE id = ?2")
            .bind(name)
            .bind(frame_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // Add method to update all frames in a video chunk
    pub async fn update_video_chunk_frames_names(
        &self,
        video_chunk_id: i64,
        name: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE frames SET name = ?1 WHERE video_chunk_id = ?2")
            .bind(name)
            .bind(video_chunk_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn repair_database(&self) -> Result<(), anyhow::Error> {
        debug!("starting aggressive database repair process");

        // Force close any pending transactions
        let emergency_steps = [
            "PRAGMA locking_mode = EXCLUSIVE;",
            "ROLLBACK;",                    // Force rollback any stuck transactions
            "PRAGMA busy_timeout = 60000;", // Increase timeout to 60s
        ];

        for step in emergency_steps {
            if let Err(e) = sqlx::query(step).execute(&self.pool).await {
                warn!("emergency step failed (continuing anyway): {}", e);
            }
        }

        // Force checkpoint and cleanup WAL files
        let wal_cleanup = [
            "PRAGMA wal_checkpoint(TRUNCATE);",
            "PRAGMA journal_mode = DELETE;", // Temporarily disable WAL
            "PRAGMA journal_size_limit = 0;", // Clear journal
        ];

        for step in wal_cleanup {
            if let Err(e) = sqlx::query(step).execute(&self.pool).await {
                warn!("wal cleanup failed (continuing anyway): {}", e);
            }
        }

        // Aggressive recovery steps
        let recovery_steps = [
            ("PRAGMA synchronous = OFF;", "disable synchronous"),
            ("PRAGMA cache_size = -2000000;", "increase cache"), // 2GB cache
            ("VACUUM;", "vacuum database"),
            ("PRAGMA integrity_check;", "check integrity"),
            ("PRAGMA foreign_key_check;", "check foreign keys"),
            ("REINDEX;", "rebuild indexes"),
            ("ANALYZE;", "update statistics"),
            ("VACUUM;", "final vacuum"), // Second vacuum after reindex
        ];

        for (query, step) in recovery_steps {
            debug!("running aggressive recovery step: {}", step);
            match sqlx::query(query).execute(&self.pool).await {
                Ok(_) => debug!("recovery step '{}' succeeded", step),
                Err(e) => warn!("recovery step '{}' failed: {}", step, e),
            }
        }

        // Restore safe settings
        let restore_steps = [
            "PRAGMA synchronous = NORMAL;",
            "PRAGMA journal_mode = WAL;",
            "PRAGMA wal_autocheckpoint = 1000;",
            "PRAGMA cache_size = -2000;", // Back to 2MB cache
            "PRAGMA locking_mode = NORMAL;",
            "PRAGMA busy_timeout = 5000;", // Back to 5s timeout
        ];

        for step in restore_steps {
            if let Err(e) = sqlx::query(step).execute(&self.pool).await {
                warn!("restore step failed: {}", e);
            }
        }

        // Final verification
        match sqlx::query_scalar::<_, String>("PRAGMA quick_check;")
            .fetch_one(&self.pool)
            .await
        {
            Ok(result) if result == "ok" => {
                debug!("database successfully repaired");
                Ok(())
            }
            Ok(result) => {
                let msg = format!("database still corrupted after repair: {}", result);
                error!("{}", msg);
                Err(anyhow::anyhow!(msg))
            }
            Err(e) => {
                let msg = format!("database repair failed catastrophically: {}", e);
                error!("{}", msg);
                Err(anyhow::anyhow!(msg))
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn search_with_text_positions(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        fuzzy_match: bool,
        order: Order,
        app_names: Option<Vec<String>>,
    ) -> Result<Vec<SearchMatch>, sqlx::Error> {
        let mut conditions = Vec::new();
        let mut owned_conditions = Vec::new();

        if start_time.is_some() {
            conditions.push("f.timestamp >= ?");
        }
        if end_time.is_some() {
            conditions.push("f.timestamp <= ?");
        }

        // Add app names condition if provided - updated to use f.app_name
        if let Some(apps) = &app_names {
            if !apps.is_empty() {
                let placeholders = vec!["?"; apps.len()].join(",");
                let app_condition = format!("f.app_name IN ({})", placeholders);
                owned_conditions.push(app_condition);
                conditions.push(owned_conditions.last().unwrap().as_str());
            }
        }

        // Create an indexed subquery for FTS matching
        let search_condition = if !query.is_empty() {
            let fts_match = if fuzzy_match {
                query
                    .split_whitespace()
                    .map(|word| format!("{}*", word))
                    .collect::<Vec<_>>()
                    .join(" OR ")
            } else {
                query.to_string()
            };
            conditions.push(
                "f.id IN (SELECT frame_id FROM ocr_text_fts WHERE text MATCH ? ORDER BY rank)",
            );
            fts_match
        } else {
            String::new()
        };

        let sql = format!(
            r#"
SELECT
    f.id,
    f.timestamp,
    f.browser_url as url,
    COALESCE(f.app_name, o.app_name) as app_name,
    COALESCE(f.window_name, o.window_name) as window_name,
    o.text as ocr_text,
    o.text_json
FROM frames f
INNER JOIN ocr_text o ON f.id = o.frame_id
WHERE {}
ORDER BY f.timestamp {}
LIMIT ? OFFSET ?
"#,
            if conditions.is_empty() {
                "1=1".to_string()
            } else {
                conditions.join(" AND ")
            },
            match order {
                Order::Ascending => "ASC",
                Order::Descending => "DESC",
            }
        );

        let mut query_builder = sqlx::query_as::<_, FrameRow>(&sql);

        // Bind timestamp parameters first
        if let Some(start) = start_time {
            query_builder = query_builder.bind(start);
        }
        if let Some(end) = end_time {
            query_builder = query_builder.bind(end);
        }

        // Bind app names if provided
        if let Some(apps) = app_names {
            if !apps.is_empty() {
                for app in apps {
                    query_builder = query_builder.bind(app);
                }
            }
        }

        // Bind search condition if query is not empty
        if !query.is_empty() {
            query_builder = query_builder.bind(&search_condition);
        }

        // Bind limit and offset
        query_builder = query_builder.bind(limit as i64).bind(offset as i64);

        let rows = query_builder.fetch_all(&self.pool).await?;

        Ok(rows
            .iter()
            .map(|row| {
                let positions = if !query.is_empty() {
                    let ocr_blocks: Vec<OcrTextBlock> =
                        serde_json::from_str(&row.text_json).unwrap_or_default();
                    find_matching_positions(&ocr_blocks, query)
                } else {
                    Vec::new()
                };

                SearchMatch {
                    frame_id: row.id,
                    timestamp: row.timestamp,
                    text_positions: positions.clone(),
                    app_name: row.app_name.clone(),
                    window_name: row.window_name.clone(),
                    confidence: calculate_confidence(&positions),
                    text: row.ocr_text.clone(),
                    url: row.url.clone(),
                }
            })
            .collect())
    }
}

pub fn find_matching_positions(blocks: &[OcrTextBlock], query: &str) -> Vec<TextPosition> {
    let query_lower = query.to_lowercase();
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();

    blocks
        .iter()
        .filter_map(|block| {
            let text_lower = block.text.to_lowercase();

            // Check for exact match or any word match
            let matches = text_lower.contains(&query_lower)
                || query_words.iter().any(|&word| text_lower.contains(word));

            if matches {
                Some(TextPosition {
                    text: block.text.clone(),
                    confidence: block.conf.parse::<f32>().unwrap_or(0.0),
                    bounds: TextBounds {
                        left: block.left.parse::<f32>().unwrap_or(0.0),
                        top: block.top.parse::<f32>().unwrap_or(0.0),
                        width: block.width.parse::<f32>().unwrap_or(0.0),
                        height: block.height.parse::<f32>().unwrap_or(0.0),
                    },
                })
            } else {
                None
            }
        })
        .collect()
}

fn calculate_confidence(positions: &[TextPosition]) -> f32 {
    if positions.is_empty() {
        return 0.0;
    }

    positions.iter().map(|pos| pos.confidence).sum::<f32>() / positions.len() as f32
}
