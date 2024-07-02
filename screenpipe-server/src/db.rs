use chrono::{NaiveDateTime, Utc};
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection, Result};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub enum SearchResult {
    OCR(OCRResult),
    Audio(AudioResult),
}

#[derive(Debug, Serialize)]
pub struct OCRResult {
    pub frame_id: i64,
    pub ocr_text: String,
    pub timestamp: NaiveDateTime,
    pub file_path: String,
    pub offset_index: i64,
}

#[derive(Debug, Serialize)]
pub struct AudioResult {
    pub audio_chunk_id: i64,
    pub transcription: String,
    pub timestamp: NaiveDateTime,
    pub file_path: String,
    pub offset_index: i64,
}

// DatabaseManager struct to encapsulate database operations
pub struct DatabaseManager {
    conn: Connection,
    current_video_chunk_id: i64,
    last_frame_id: i64,
    current_frame_offset: i64,
    recent_frames_threshold: i64,
    fps: i32,
}

impl DatabaseManager {
    // Initialize a new DatabaseManager instance
    pub fn new(database_path: &str) -> Result<DatabaseManager> {
        let conn = Connection::open(database_path)?;
        let mut db_manager = DatabaseManager {
            conn,
            current_video_chunk_id: 0,
            last_frame_id: 0,
            current_frame_offset: 0,
            recent_frames_threshold: 15,
            fps: 25,
        };
        db_manager.create_tables()?;
        db_manager.current_video_chunk_id = db_manager.get_current_video_chunk_id()?;
        db_manager.last_frame_id = db_manager.get_last_frame_id()?;
        Ok(db_manager)
    }

    pub fn insert_audio_chunk(&self, file_path: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO audio_chunks (file_path) VALUES (?1)",
            params![file_path],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn insert_audio_transcription(
        &self,
        audio_chunk_id: i64,
        transcription: &str,
        offset_index: i64,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO audio_transcriptions (audio_chunk_id, transcription, offset_index, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![audio_chunk_id, transcription, offset_index, Utc::now().naive_utc()],
        )?;
        Ok(())
    }

    // Function to create the necessary tables
    fn create_tables(&self) -> Result<()> {
        // Create the video_chunks table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS video_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL
        )",
            [],
        )?;

        // Create the frames table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS frames (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_chunk_id INTEGER NOT NULL,
            offset_index INTEGER NOT NULL,
            timestamp TIMESTAMP NOT NULL
        )",
            [],
        )?;

        // TODO
        // -- FOREIGN KEY (video_chunk_id) REFERENCES video_chunks(id)

        // Create the ocr_text virtual table
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS ocr_text USING fts4(
            frame_id INTEGER NOT NULL,
            text TEXT NOTNULL
        )",
            [],
        )?;

        // Create the audio_chunks table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS audio_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL
            )",
            [],
        )?;

        // Create the audio_transcriptions table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS audio_transcriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                audio_chunk_id INTEGER NOT NULL,
                offset_index INTEGER NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                transcription TEXT NOT NULL,
                FOREIGN KEY (audio_chunk_id) REFERENCES audio_chunks(id)
            )",
            [],
        )?;

        // Create indices and seed data as necessary
        self.create_indices()?;

        Ok(())
    }

    fn get_all_frames(&self) -> Result<Vec<(i64, i64, i64, NaiveDateTime)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, video_chunk_id, offset_index, timestamp FROM frames")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        rows.collect()
    }

    fn get_all_ocr_text(&self) -> Result<Vec<(i64, String)>> {
        let mut stmt = self.conn.prepare("SELECT frame_id, text FROM ocr_text")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.collect()
    }

    fn get_all_audio_transcriptions(&self) -> Result<Vec<(i64, String, i64, NaiveDateTime)>> {
        let mut stmt = self.conn.prepare("SELECT audio_chunk_id, transcription, offset_index, timestamp FROM audio_transcriptions")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        rows.collect()
    }
    // Method to purge (drop and recreate) all tables
    pub fn purge(&mut self) -> Result<()> {
        self.conn.execute("DROP TABLE IF EXISTS video_chunks", [])?;
        self.conn.execute("DROP TABLE IF EXISTS frames", [])?;
        self.conn.execute("DROP TABLE IF EXISTS ocr_text", [])?;
        self.conn.execute("DROP TABLE IF EXISTS audio_chunks", [])?;
        self.conn
            .execute("DROP TABLE IF EXISTS audio_transcriptions", [])?;

        self.create_tables()?;
        self.current_video_chunk_id = self.get_current_video_chunk_id()?;
        self.last_frame_id = self.get_last_frame_id()?;
        Ok(())
    }

    // Function to create indices for optimization
    fn create_indices(&self) -> Result<()> {
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_video_chunk_id_id ON frames (video_chunk_id, id)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_timestamp ON frames (timestamp)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audio_chunk_id_id ON audio_transcriptions (audio_chunk_id, offset_index)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_timestamp ON audio_transcriptions (timestamp)",
            [],
        )?;
        Ok(())
    }

    // Function to get the current chunk ID
    fn get_current_video_chunk_id(&self) -> Result<i64> {
        self.conn.query_row(
            "SELECT IFNULL(MAX(id), 0) + 1 FROM video_chunks",
            [],
            |row| row.get(0),
        )
    }

    // Function to get the last frame ID
    fn get_last_frame_id(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT IFNULL(MAX(id), 0) FROM frames", [], |row| {
                row.get(0)
            })
    }

    // Method to start a new video chunk and return its ID
    pub fn start_new_video_chunk(&mut self, file_path: &str) -> Result<i64> {
        let chunk_id = self.conn.execute(
            "INSERT INTO video_chunks (file_path) VALUES (?1)",
            params![file_path],
        )?;
        self.current_video_chunk_id = chunk_id as i64;
        self.current_frame_offset = 0;
        Ok(self.current_video_chunk_id)
    }

    // Method to insert a frame and return its ID
    pub fn insert_frame(&mut self) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO frames (video_chunk_id, offset_index, timestamp)
             VALUES (?1, ?2, ?3)",
            params![
                self.current_video_chunk_id,
                self.current_frame_offset,
                Utc::now().naive_utc(),
            ],
        )?;

        self.current_frame_offset += 1;
        self.last_frame_id = self.conn.last_insert_rowid();

        Ok(self.last_frame_id)
    }

    // Method to insert text for a frame
    pub fn insert_text_for_frame(&self, frame_id: i64, text: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO ocr_text (frame_id, text) VALUES (?1, ?2)",
            params![frame_id, text],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    // Method to get a frame by index
    pub fn get_frame(&self, index: i64) -> Result<Option<(i64, String, Option<String>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT f.offset_index, vc.file_path, at.text 
             FROM frames f
             JOIN video_chunks vc ON f.video_chunk_id = vc.id
             LEFT JOIN ocr_text at ON f.id = at.frame_id
             WHERE f.id = ?1",
        )?;
        let mut rows = stmt.query(params![index])?;

        if let Some(row) = rows.next()? {
            let offset_index: i64 = row.get(0)?;
            let file_path: String = row.get(1)?;
            let text: Option<String> = row.get(2)?;
            Ok(Some((offset_index, file_path, text)))
        } else {
            Ok(None)
        }
    }

    // Method to check if a frame exists for a given index
    pub fn frame_exists(&self, index: i64) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM frames WHERE id = ?1",
            params![index],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    // Method to retrieve the file path of a video chunk by its index
    pub fn get_video_chunk_path(&self, index: i64) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT file_path FROM video_chunks WHERE id = ?1")?;
        let mut rows = stmt.query(params![index])?;

        if let Some(row) = rows.next()? {
            let file_path: String = row.get(0)?;
            Ok(Some(file_path))
        } else {
            Ok(None)
        }
    }

    // Method to get audio transcription for a frame
    pub fn get_audio_transcription(&self, audio_chunk_id: i64) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT transcription FROM audio_transcriptions WHERE audio_chunk_id = ?1",
                params![audio_chunk_id],
                |row| row.get(0),
            )
            .optional()
    }

    // Method to perform a search based on text
    pub fn search(&self, search_text: &str, limit: i64, offset: i64) -> Result<Vec<SearchResult>> {
        let mut results = Vec::new();

        // Search OCR text
        let ocr_query = "
            SELECT f.id, o.text, f.timestamp, vc.file_path, f.offset_index
            FROM frames f
            JOIN video_chunks vc ON f.video_chunk_id = vc.id
            JOIN ocr_text o ON f.id = o.frame_id
            WHERE o.text LIKE ?1
            ORDER BY f.timestamp DESC
            LIMIT ?2 OFFSET ?3
        ";

        let search_pattern = format!("%{}%", search_text);
        let mut ocr_stmt = self.conn.prepare(ocr_query)?;
        let ocr_rows = ocr_stmt.query_map(params![search_pattern, limit, offset], |row| {
            Ok(SearchResult::OCR(OCRResult {
                frame_id: row.get(0)?,
                ocr_text: row.get(1)?,
                timestamp: row.get(2)?,
                file_path: row.get(3)?,
                offset_index: row.get(4)?,
            }))
        })?;

        for row in ocr_rows {
            results.push(row?);
        }

        // Search audio transcriptions
        let audio_query = "
            SELECT at.audio_chunk_id, at.transcription, at.timestamp, ac.file_path, at.offset_index
            FROM audio_transcriptions at
            JOIN audio_chunks ac ON at.audio_chunk_id = ac.id
            WHERE at.transcription LIKE ?1
            ORDER BY at.timestamp DESC
            LIMIT ?2 OFFSET ?3
        ";

        let mut audio_stmt = self.conn.prepare(audio_query)?;
        let audio_rows = audio_stmt.query_map(params![search_pattern, limit, offset], |row| {
            Ok(SearchResult::Audio(AudioResult {
                audio_chunk_id: row.get(0)?,
                transcription: row.get(1)?,
                timestamp: row.get(2)?,
                file_path: row.get(3)?,
                offset_index: row.get(4)?,
            }))
        })?;

        for row in audio_rows {
            results.push(row?);
        }

        Ok(results)
    }
    // Modify the get_recent_results method
    pub fn get_recent_results(
        &self,
        limit: i64,
        offset: i64,
        start_date: Option<NaiveDateTime>,
        end_date: Option<NaiveDateTime>,
    ) -> Result<Vec<SearchResult>> {
        let mut results = Vec::new();

        // Debug: Print date range
        println!("Date range: {:?} to {:?}", start_date, end_date);

        // Query for recent OCR results
        let ocr_query = "
        SELECT f.id, COALESCE(o.text, ''), f.timestamp, vc.file_path, f.offset_index
        FROM frames f
        JOIN video_chunks vc ON f.video_chunk_id = vc.id
        LEFT JOIN ocr_text o ON f.id = o.frame_id
        WHERE f.timestamp BETWEEN COALESCE(?1, datetime('now', '-100 years')) AND COALESCE(?2, datetime('now', '+1 day'))
        ORDER BY f.timestamp DESC
    ";

        let mut ocr_stmt = self.conn.prepare(ocr_query)?;
        let ocr_rows = ocr_stmt.query_map(params![start_date, end_date], |row| {
            Ok(SearchResult::OCR(OCRResult {
                frame_id: row.get(0)?,
                ocr_text: row.get(1)?,
                timestamp: row.get(2)?,
                file_path: row.get(3)?,
                offset_index: row.get(4)?,
            }))
        })?;

        for row in ocr_rows {
            results.push(row?);
        }

        // Debug: Print OCR results count
        println!("OCR results count: {}", results.len());

        // Query for recent audio transcription results
        let audio_query = "
        SELECT at.audio_chunk_id, at.transcription, at.timestamp, ac.file_path, at.offset_index
        FROM audio_transcriptions at
        JOIN audio_chunks ac ON at.audio_chunk_id = ac.id
        WHERE at.timestamp BETWEEN COALESCE(?1, datetime('now', '-100 years')) AND COALESCE(?2, datetime('now', '+1 day'))
        ORDER BY at.timestamp DESC
    ";

        let mut audio_stmt = self.conn.prepare(audio_query)?;
        let audio_rows = audio_stmt.query_map(params![start_date, end_date], |row| {
            Ok(SearchResult::Audio(AudioResult {
                audio_chunk_id: row.get(0)?,
                transcription: row.get(1)?,
                timestamp: row.get(2)?,
                file_path: row.get(3)?,
                offset_index: row.get(4)?,
            }))
        })?;

        for row in audio_rows {
            results.push(row?);
        }

        // Debug: Print total results count
        println!("Total results count: {}", results.len());

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

        // Apply limit and offset to the combined results
        let start = offset as usize;
        let end = (offset + limit) as usize;
        let final_results: Vec<SearchResult> =
            results.into_iter().skip(start).take(end - start).collect();

        // Debug: Print final results count
        println!("Final results count: {}", final_results.len());

        Ok(final_results)
    }
}

// ... existing code ...

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn setup_test_db() -> DatabaseManager {
        let conn = Connection::open_in_memory().unwrap();
        let mut db = DatabaseManager {
            conn,
            current_video_chunk_id: 0,
            last_frame_id: 0,
            current_frame_offset: 0,
            recent_frames_threshold: 15,
            fps: 25,
        };
        db.create_tables().unwrap();
        db
    }
    fn add_test_data(db: &mut DatabaseManager) -> Result<()> {
        // Add video chunks
        let video_chunk_1 = db.start_new_video_chunk("video1.mp4")?;
        let video_chunk_2 = db.start_new_video_chunk("video2.mp4")?;

        // Add audio chunks
        let audio_chunk_1 = db.insert_audio_chunk("audio1.wav")?;
        let audio_chunk_2 = db.insert_audio_chunk("audio2.wav")?;

        // Add frames with OCR text and audio transcriptions
        let frame1 = db.insert_frame()?;
        db.insert_text_for_frame(frame1, "The quick brown fox jumps over the lazy dog")?;
        db.insert_audio_transcription(audio_chunk_1, "A dog barks in the distance", 0)?;

        let frame2 = db.insert_frame()?;
        db.insert_text_for_frame(frame2, "A cat sleeps on the windowsill")?;
        db.insert_audio_transcription(audio_chunk_1, "Soft purring can be heard", 1)?;

        let frame3 = db.insert_frame()?;
        db.insert_text_for_frame(frame3, "git commit -m 'Add new feature'")?;
        db.insert_audio_transcription(audio_chunk_2, "Keyboard typing sounds", 0)?;

        // Print inserted data for debugging
        println!("Inserted frames: {:?}", db.get_all_frames()?);
        println!("Inserted OCR text: {:?}", db.get_all_ocr_text()?);
        println!(
            "Inserted audio transcriptions: {:?}",
            db.get_all_audio_transcriptions()?
        );

        Ok(())
    }

    #[test]
    fn test_search() -> Result<()> {
        let mut db = setup_test_db();
        add_test_data(&mut db)?;

        // Test searching for "dog"
        let results = db.search("dog", 10, 0)?;
        println!("results: {:?}", results);
        assert_eq!(results.len(), 2); // Should find both OCR and audio results

        let ocr_dog = results
            .iter()
            .find(|r| matches!(r, SearchResult::OCR(_)))
            .unwrap();
        let audio_dog = results
            .iter()
            .find(|r| matches!(r, SearchResult::Audio(_)))
            .unwrap();

        if let SearchResult::OCR(ocr) = ocr_dog {
            assert!(ocr.ocr_text.contains("dog"));
        } else {
            panic!("Expected OCR result");
        }

        if let SearchResult::Audio(audio) = audio_dog {
            assert!(audio.transcription.contains("dog"));
        } else {
            panic!("Expected Audio result");
        }

        // Test searching for "cat"
        let results = db.search("cat", 10, 0)?;
        assert_eq!(results.len(), 1);
        if let SearchResult::OCR(ocr) = &results[0] {
            assert!(ocr.ocr_text.contains("cat"));
        } else {
            panic!("Expected OCR result for 'cat'");
        }

        // Test searching for "git"
        let results = db.search("git", 10, 0)?;
        assert_eq!(results.len(), 1);
        if let SearchResult::OCR(ocr) = &results[0] {
            assert!(ocr.ocr_text.contains("git"));
        } else {
            panic!("Expected OCR result for 'git'");
        }

        Ok(())
    }

    #[test]
    fn test_get_recent_results() -> Result<()> {
        let mut db = setup_test_db();
        add_test_data(&mut db)?;

        // Debug: Print all frames
        let all_frames: Vec<(i64, String, Option<String>)> =
            (1..=3).filter_map(|i| db.get_frame(i).unwrap()).collect();
        println!("All frames: {:?}", all_frames);

        // Test getting recent results
        let results = db.get_recent_results(10, 0, None, None)?;
        println!("Recent results: {:?}", results);

        assert!(results.len() > 0, "Expected at least one result");

        // Check if results are in reverse chronological order
        let mut prev_timestamp = chrono::NaiveDateTime::MAX;
        for result in &results {
            let current_timestamp = match result {
                SearchResult::OCR(ocr) => ocr.timestamp,
                SearchResult::Audio(audio) => audio.timestamp,
            };
            assert!(current_timestamp <= prev_timestamp);
            prev_timestamp = current_timestamp;
        }

        // Test limit and offset
        let results = db.get_recent_results(2, 1, None, None)?;
        assert_eq!(results.len(), 2);

        // Test with date filter
        let start_date = chrono::NaiveDateTime::from_timestamp_opt(0, 0).unwrap();
        let end_date = chrono::Utc::now().naive_utc();
        let results = db.get_recent_results(10, 0, Some(start_date), Some(end_date))?;
        assert!(results.len() > 0);
        assert_eq!(results.len(), 3);
        Ok(())
    }
}

// Debugging:
// # 1. List all tables
// sqlite3 data/db.sqlite ".tables"

// # 2. Dump entire database content
// sqlite3 data/db.sqlite ".dump"

// # 3. Show schema for all tables
// sqlite3 data/db.sqlite ".schema"

// # 4. Query recent frames with OCR text
// sqlite3 data/db.sqlite "SELECT f.id, f.timestamp, o.text FROM frames f JOIN ocr_text o ON f.id = o.frame_id ORDER BY f.timestamp DESC LIMIT 10;"

// # 5. Query recent audio transcriptions
// sqlite3 data/db.sqlite "SELECT at.audio_chunk_id, at.timestamp, at.transcription FROM audio_transcriptions at ORDER BY at.timestamp DESC LIMIT 10;"

// # 6. Just list a table content
// sqlite3 data/db.sqlite "SELECT * FROM frames"

// sqlite3 data/db.sqlite "SELECT * FROM audio_chunks"

// sqlite3 data/db.sqlite "SELECT * FROM video_chunks"

// sqlite3 data/db.sqlite "SELECT * FROM ocr_text"

// sqlite3 data/db.sqlite "SELECT * FROM audio_transcriptions"
