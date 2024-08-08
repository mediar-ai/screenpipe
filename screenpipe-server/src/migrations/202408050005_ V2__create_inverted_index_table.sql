CREATE TABLE chunked_text_index (
    text_id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL UNIQUE
);

CREATE TABLE chunked_text_entries (
    text_id INTEGER NOT NULL,
    frame_id INTEGER,
    audio_chunk_id INTEGER,
    timestamp DATETIME NOT NULL,
    engine TEXT NOT NULL,
    chunking_engine TEXT NOT NULL,
    source TEXT NOT NULL,
    FOREIGN KEY (text_id) REFERENCES chunked_text_index(text_id),
    FOREIGN KEY (frame_id) REFERENCES frames(id),
    FOREIGN KEY (audio_chunk_id) REFERENCES audio_chunks(id)
);

-- Add ocr_engine column to ocr_text table
ALTER TABLE ocr_text ADD COLUMN ocr_engine TEXT NOT NULL DEFAULT 'unknown';

-- Update existing rows to have a default value
UPDATE ocr_text SET ocr_engine = 'unknown' WHERE ocr_engine IS NULL;