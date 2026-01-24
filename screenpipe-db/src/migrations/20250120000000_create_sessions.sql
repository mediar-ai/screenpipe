-- Create sessions table for tracking app/window usage sessions
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    window_name TEXT NOT NULL,
    device_name TEXT NOT NULL,
    start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    duration_secs INTEGER,
    frame_count INTEGER DEFAULT 0,
    audio_count INTEGER DEFAULT 0,
    ui_count INTEGER DEFAULT 0,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sessions_app_name ON sessions(app_name);
CREATE INDEX IF NOT EXISTS idx_sessions_window_name ON sessions(window_name);
CREATE INDEX IF NOT EXISTS idx_sessions_device_name ON sessions(device_name);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_app_window ON sessions(app_name, window_name);
CREATE INDEX IF NOT EXISTS idx_sessions_time_range ON sessions(start_time, end_time);

-- Add session_id column to frames table
ALTER TABLE frames ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_frames_session_id ON frames(session_id);

-- Add session_id column to audio_transcriptions table
ALTER TABLE audio_transcriptions ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_session_id ON audio_transcriptions(session_id);

-- Add session_id column to ui_monitoring table
ALTER TABLE ui_monitoring ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_session_id ON ui_monitoring(session_id);
