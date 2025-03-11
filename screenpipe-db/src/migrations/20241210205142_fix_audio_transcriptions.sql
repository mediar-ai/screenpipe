-- Add migration script here
-- this migration needs to make audio_transcriptions id column primary key with auto increment and also give all current rows an id
-- First, create a temporary table with the desired schema

CREATE TABLE "audio_transcriptions_new" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audio_chunk_id INTEGER NOT NULL,
    offset_index INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    transcription TEXT NOT NULL,
    device TEXT NOT NULL DEFAULT '',
    is_input_device BOOLEAN NOT NULL DEFAULT TRUE,
    speaker_id INTEGER,
    transcription_engine TEXT NOT NULL DEFAULT 'Whisper',
    FOREIGN KEY (audio_chunk_id) REFERENCES audio_chunks(id)
);

-- Copy existing data to the new table
INSERT INTO audio_transcriptions_new (
    audio_chunk_id,
    offset_index,
    timestamp,
    transcription,
    transcription_engine,
    device,
    is_input_device,
    speaker_id
)
SELECT 
    audio_chunk_id,
    offset_index,
    timestamp,
    transcription,
    transcription_engine,
    device,
    is_input_device,
    speaker_id
FROM audio_transcriptions;

-- Drop the old table
DROP TABLE audio_transcriptions;

-- Rename the new table to the original name
ALTER TABLE audio_transcriptions_new RENAME TO audio_transcriptions;

CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_audio_chunk_id_timestamp ON audio_transcriptions(audio_chunk_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_audio_chunk_id ON audio_transcriptions(audio_chunk_id);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_timestamp ON audio_transcriptions(timestamp);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_transcription ON audio_transcriptions(transcription);

-- Start transaction and temporarily disable foreign keys for the migration
PRAGMA foreign_keys = OFF;

-- Drop existing triggers and FTS tables
DROP TRIGGER IF EXISTS audio_transcriptions_ai;
DROP TABLE IF EXISTS audio_transcriptions_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS audio_transcriptions_fts USING fts5(
    transcription,
    device,
    audio_chunk_id UNINDEXED,
    tokenize='unicode61'
);

INSERT OR IGNORE INTO audio_transcriptions_fts(audio_chunk_id, transcription, device)
SELECT 
    audio_chunk_id, 
    COALESCE(transcription, '') as transcription,
    COALESCE(device, '') as device
FROM audio_transcriptions 
WHERE transcription IS NOT NULL 
  AND transcription != ''
  AND audio_chunk_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS audio_transcriptions_ai AFTER INSERT ON audio_transcriptions 
WHEN NEW.transcription IS NOT NULL AND NEW.transcription != '' AND NEW.audio_chunk_id IS NOT NULL
BEGIN
    INSERT OR IGNORE INTO audio_transcriptions_fts(audio_chunk_id, transcription, device)
    VALUES (
        NEW.audio_chunk_id,
        NEW.transcription,
        COALESCE(NEW.device, '')
    );
END;

CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_timestamp ON audio_transcriptions(timestamp);

-- Re-enable foreign keys after migration
PRAGMA foreign_keys = ON;

