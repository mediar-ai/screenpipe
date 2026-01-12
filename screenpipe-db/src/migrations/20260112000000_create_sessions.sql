-- Create sessions table for tracking user activity sessions
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    window_name TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME
);

-- Index for time-based queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
