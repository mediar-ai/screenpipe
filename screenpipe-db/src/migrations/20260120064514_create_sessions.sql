-- Sessions table for tracking continuous periods of user interaction
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    window_name TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration_secs REAL,
    focused_duration_secs REAL DEFAULT 0,
    device_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_app_name ON sessions(app_name);
CREATE INDEX IF NOT EXISTS idx_sessions_window_name ON sessions(window_name);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_app_window ON sessions(app_name, window_name);
CREATE INDEX IF NOT EXISTS idx_sessions_time_range ON sessions(start_time, end_time);

-- Add session_id to frames table
ALTER TABLE frames ADD COLUMN session_id INTEGER REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_frames_session_id ON frames(session_id);

-- Add session_id to audio_transcriptions table
ALTER TABLE audio_transcriptions ADD COLUMN session_id INTEGER REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_session_id ON audio_transcriptions(session_id);

-- Add session_id to ui_monitoring table
ALTER TABLE ui_monitoring ADD COLUMN session_id INTEGER REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_session_id ON ui_monitoring(session_id);

-- FTS for sessions
CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
    app_name,
    window_name,
    id UNINDEXED,
    tokenize='unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
    INSERT INTO sessions_fts(app_name, window_name, id)
    VALUES (NEW.app_name, NEW.window_name, NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
    DELETE FROM sessions_fts WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
    DELETE FROM sessions_fts WHERE id = OLD.id;
    INSERT INTO sessions_fts(app_name, window_name, id)
    VALUES (NEW.app_name, NEW.window_name, NEW.id);
END;
