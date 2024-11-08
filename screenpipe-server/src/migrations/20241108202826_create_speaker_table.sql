-- Create speakers table
CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    embedding REAL[512],
    metadata JSON
);
