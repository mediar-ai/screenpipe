-- Create ocr_text_embeddings table
CREATE TABLE IF NOT EXISTS ocr_text_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frame_id INTEGER NOT NULL,
    embedding BLOB NOT NULL,  -- Store embeddings as BLOB since they're float arrays
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (frame_id) REFERENCES frames(id) ON DELETE CASCADE
);