-- Add to the "up" migration
PRAGMA foreign_keys=off;

-- Create a new table with the desired structure
CREATE TABLE IF NOT EXISTS ocr_text_new (
    frame_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    text_json TEXT,
    app_name TEXT NOT NULL DEFAULT '',
    ocr_engine TEXT NOT NULL DEFAULT 'unknown'
);

-- Copy data from the old table to the new table
INSERT INTO ocr_text_new (frame_id, text, text_json, app_name, ocr_engine)
SELECT frame_id, text, text_json, app_name, ocr_engine
FROM ocr_text;

-- Drop the old table
DROP TABLE IF EXISTS ocr_text;

-- Rename the new table to the original name
ALTER TABLE ocr_text_new RENAME TO ocr_text;

-- Recreate any indexes or triggers on the new table if needed
-- For example:
-- CREATE INDEX IF NOT EXISTS idx_ocr_text_frame_id ON ocr_text(frame_id);

PRAGMA foreign_keys=on;