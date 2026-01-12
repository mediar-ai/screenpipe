-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    window_name TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    duration_secs REAL GENERATED ALWAYS AS ((julianday(end_time) - julianday(start_time)) * 86400.0) VIRTUAL
);

-- Add indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_app_window ON sessions(app_name, window_name);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time);

-- Add session_id to frames
ALTER TABLE frames ADD COLUMN session_id INTEGER REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_frames_session_id ON frames(session_id);

-- Add session_id to audio_transcriptions
ALTER TABLE audio_transcriptions ADD COLUMN session_id INTEGER REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_session_id ON audio_transcriptions(session_id);

-- Add session_id to ui_monitoring
ALTER TABLE ui_monitoring ADD COLUMN session_id INTEGER REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_session_id ON ui_monitoring(session_id);
