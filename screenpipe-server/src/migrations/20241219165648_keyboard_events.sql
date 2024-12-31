-- Add keyboard_events table
CREATE TABLE IF NOT EXISTS keyboard_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    key TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('press', 'release')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add index for faster timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_keyboard_events_timestamp ON keyboard_events(timestamp);
