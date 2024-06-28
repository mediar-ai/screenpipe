use chrono::{NaiveDateTime, Utc};
use rusqlite::{params, params_from_iter, Connection, Result};

// Structs representing the database tables
#[derive(Debug)]
struct VideoChunk {
    id: i64,
    file_path: String,
}

#[derive(Debug)]
struct Frame {
    id: i64,
    chunk_id: i64,
    offset_index: i64,
    timestamp: NaiveDateTime,
    active_application_name: Option<String>,
}

#[derive(Debug)]
struct UniqueAppName {
    id: i64,
    active_application_name: String,
}

#[derive(Debug)]
struct AllText {
    frame_id: i64,
    text: String,
}

#[derive(Debug)]
pub struct SearchResult {
    pub frame_id: i64,
    pub full_text: Option<String>,
    pub application_name: Option<String>,
    pub timestamp: NaiveDateTime,
    pub file_path: String,
    pub offset_index: i64,
}

// DatabaseManager struct to encapsulate database operations
pub struct DatabaseManager {
    conn: Connection,
    current_chunk_id: i64,
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
            current_chunk_id: 0,
            last_frame_id: 0,
            current_frame_offset: 0,
            recent_frames_threshold: 15,
            fps: 25,
        };
        db_manager.create_tables()?;
        db_manager.current_chunk_id = db_manager.get_current_chunk_id()?;
        db_manager.last_frame_id = db_manager.get_last_frame_id()?;
        Ok(db_manager)
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
            chunk_id INTEGER NOT NULL,
            offset_index INTEGER NOT NULL,
            timestamp TIMESTAMP NOT NULL,
            active_application_name TEXT
        )",
            [],
        )?;

        // Create the unique_app_names table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS unique_app_names (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            active_application_name TEXT UNIQUE NOT NULL
        )",
            [],
        )?;

        // Create the all_text virtual table
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS all_text USING fts4(
            frame_id INTEGER NOT NULL,
            text TEXT NOTNULL
        )",
            [],
        )?;
        // Create indices and seed data as necessary
        self.create_indices()?;

        Ok(())
    }

    // Method to purge (drop and recreate) all tables
    pub fn purge(&mut self) -> Result<()> {
        self.conn.execute("DROP TABLE IF EXISTS video_chunks", [])?;
        self.conn.execute("DROP TABLE IF EXISTS frames", [])?;
        self.conn
            .execute("DROP TABLE IF EXISTS unique_app_names", [])?;
        self.conn.execute("DROP TABLE IF EXISTS all_text", [])?;

        self.create_tables()?;
        self.current_chunk_id = self.get_current_chunk_id()?;
        self.last_frame_id = self.get_last_frame_id()?;
        Ok(())
    }

    // Function to create indices for optimization
    fn create_indices(&self) -> Result<()> {
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chunk_id_id ON frames (chunk_id, id)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_timestamp ON frames (timestamp)",
            [],
        )?;
        Ok(())
    }

    // Function to get the current chunk ID
    fn get_current_chunk_id(&self) -> Result<i64> {
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
        self.current_chunk_id = chunk_id as i64;
        self.current_frame_offset = 0;
        Ok(self.current_chunk_id)
    }

    // Method to insert a frame and return its ID
    pub fn insert_frame(&mut self, active_application_name: Option<String>) -> Result<i64> {
        let frame_id = self.conn.execute(
            "INSERT INTO frames (chunk_id, offset_index, timestamp, active_application_name)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                self.current_chunk_id,
                self.current_frame_offset,
                Utc::now().naive_utc(),
                active_application_name,
            ],
        )?;

        self.current_frame_offset += 1;
        self.last_frame_id = frame_id as i64;

        // If the active application name exists, ensure it is in the unique_app_names table
        if let Some(app_name) = active_application_name {
            self.insert_unique_application_names_if_needed(&app_name)?;
        }

        Ok(self.last_frame_id)
    }

    // Method to insert unique application names if needed
    fn insert_unique_application_names_if_needed(&self, app_name: &str) -> Result<()> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM unique_app_names WHERE active_application_name = ?1",
            params![app_name],
            |row| row.get(0),
        )?;

        if count == 0 {
            self.insert_unique_application_name(app_name)?;
        }
        Ok(())
    }

    // Method to insert unique application names
    fn insert_unique_application_name(&self, app_name: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO unique_app_names (active_application_name) VALUES (?1)",
            params![app_name],
        )?;
        Ok(())
    }

    // Method to insert text for a frame
    pub fn insert_text_for_frame(&self, frame_id: i64, text: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO all_text (frame_id, text) VALUES (?1, ?2)",
            params![frame_id, text],
        )?;
        Ok(())
    }

    // Method to get a frame by index
    pub fn get_frame(&self, index: i64) -> Result<Option<(i64, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT f.offset_index, vc.file_path FROM frames f
         JOIN video_chunks vc ON f.chunk_id = vc.id
         WHERE f.id = ?1",
        )?;
        let mut rows = stmt.query(params![index])?;

        if let Some(row) = rows.next()? {
            let offset_index: i64 = row.get(0)?;
            let file_path: String = row.get(1)?;
            Ok(Some((offset_index, file_path)))
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

    // Method to perform a search based on app name and/or text
    pub fn search(
        &self,
        search_text: &str,
        limit: i64,
        offset: i64,
        app_name: Option<&str>,
    ) -> Result<Vec<SearchResult>> {
        let mut query = String::from(
            "SELECT a.frame_id, a.text, f.active_application_name, f.timestamp, vc.file_path, f.offset_index
             FROM all_text a
             JOIN frames f ON f.id = a.frame_id
             JOIN video_chunks vc ON f.chunk_id = vc.id ",
        );

        let mut params: Vec<rusqlite::types::Value> = Vec::new();
        let mut params_count = 1;

        if let Some(app_name) = app_name {
            query.push_str("JOIN unique_app_names uan ON uan.active_application_name = f.active_application_name ");
            query.push_str(
                format!("WHERE uan.active_application_name LIKE ?{} ", params_count).as_str(),
            );
            params.push(String::from(app_name).into());
            // Update params count
            params_count = params.len() + 1;
        }

        if !search_text.is_empty() {
            if !params.is_empty() {
                query.push_str("AND ");
            } else {
                query.push_str("WHERE ");
            }
            query.push_str(format!("a.text MATCH ?{} ", params_count).as_str());
            params.push(String::from(search_text).into());
            // Update params count
            params_count = params.len() + 1;
        }

        query.push_str(
            format!(
                "ORDER BY f.timestamp DESC LIMIT ?{} OFFSET ?{}",
                params_count,
                params_count + 1
            )
            .as_str(),
        );
        params.push(String::from(limit.to_string()).into());
        params.push(String::from(offset.to_string()).into());
        // Update params count
        params_count = params.len() + 1;

        let mut stmt = self.conn.prepare(&query)?;

        let search_results = stmt
            .query_map(params_from_iter(params), |row| {
                Ok(SearchResult {
                    frame_id: row.get(0)?,
                    full_text: row.get(1)?,
                    application_name: row.get(2)?,
                    timestamp: row.get(3)?,
                    file_path: row.get(4)?,
                    offset_index: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        Ok(search_results)
    }

    // Method to get recent results with an optional filter for application name
    pub fn get_recent_results(
        &self,
        limit: i64,
        offset: i64,
        selected_filter_app: Option<&str>,
    ) -> Result<Vec<SearchResult>> {
        let mut query = String::from(
            "SELECT f.id, NULL, f.active_application_name, f.timestamp, vc.file_path, f.offset_index
             FROM frames f
             JOIN video_chunks vc ON f.chunk_id = vc.id ",
        );

        let mut params: Vec<rusqlite::types::Value> = Vec::new();
        let mut params_count = 1;

        if let Some(app_name) = selected_filter_app {
            query.push_str("JOIN unique_app_names uan ON uan.active_application_name = f.active_application_name ");
            query.push_str(
                format!("WHERE uan.active_application_name LIKE ?{} ", params_count).as_str(),
            );
            params.push(String::from(app_name).into());
            // Added a param
            params_count = params.len() + 1;
        }

        query.push_str(
            format!(
                "ORDER BY f.timestamp DESC LIMIT ?{} OFFSET ?{}",
                params_count,
                params_count + 1
            )
            .as_str(),
        );
        params.push(String::from(limit.to_string()).into());
        params.push(String::from(offset.to_string()).into());
        // Update params count
        params_count = params.len() + 1;

        let mut stmt = self.conn.prepare(&query)?;
        let final_params = params_from_iter(params);
        let results = stmt
            .query_map(final_params, |row| {
                Ok(SearchResult {
                    frame_id: row.get(0)?,
                    full_text: None, // Since the full text is not being fetched here
                    application_name: row.get(2)?,
                    timestamp: row.get(3)?,
                    file_path: row.get(4)?,
                    offset_index: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        Ok(results)
    }

    // Method to get recent text context
    pub fn get_recent_text_context(&self) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT text FROM all_text ORDER BY frame_id DESC LIMIT ?1")?;
        let texts = stmt
            .query_map(params![self.recent_frames_threshold], |row| Ok(row.get(0)?))?
            .collect::<Result<Vec<String>, rusqlite::Error>>()?;

        Ok(texts)
    }

    // Method to get the maximum frame ID
    pub fn get_max_frame(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT IFNULL(MAX(id), 0) FROM frames", [], |row| {
                row.get(0)
            })
    }

    // Method to get the last accessible frame ID
    pub fn get_last_accessible_frame(&self) -> Result<i64> {
        self.conn.query_row(
            "SELECT f.id FROM frames f
             JOIN video_chunks vc ON f.chunk_id = vc.id
             ORDER BY f.id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
    }

    // Method to get all unique application names
    pub fn get_all_application_names(&self) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT active_application_name FROM unique_app_names")?;
        let app_names = stmt
            .query_map([], |row| Ok(row.get(0)?))?
            .collect::<Result<Vec<String>, rusqlite::Error>>()?;

        Ok(app_names)
    }
}
