-- Add migration script here
ALTER TABLE audio_transcriptions ADD COLUMN start_time REAL;
ALTER TABLE audio_transcriptions ADD COLUMN end_time REAL;

PRAGMA foreign_keys = OFF;

-- Drop existing triggers and FTS tables
DROP TRIGGER IF EXISTS audio_transcriptions_ai;
DROP TRIGGER IF EXISTS audio_transcriptions_update;
DROP TRIGGER IF EXISTS audio_transcriptions_delete;
DROP TABLE IF EXISTS audio_transcriptions_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS audio_transcriptions_fts USING fts5(
    transcription,
    device,
    audio_chunk_id UNINDEXED,
    speaker_id,
    start_time UNINDEXED,
    end_time UNINDEXED,
    tokenize='unicode61'
);

INSERT OR IGNORE INTO audio_transcriptions_fts(transcription, device, audio_chunk_id, speaker_id, start_time, end_time)
SELECT 
    COALESCE(transcription, '') as transcription,
    COALESCE(device, '') as device,
    audio_chunk_id,
    speaker_id,
    start_time,
    end_time
FROM audio_transcriptions 
WHERE transcription IS NOT NULL 
  AND transcription != ''
  AND audio_chunk_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS audio_transcriptions_ai AFTER INSERT ON audio_transcriptions 
WHEN NEW.transcription IS NOT NULL AND NEW.transcription != '' AND NEW.audio_chunk_id IS NOT NULL
BEGIN
    INSERT OR IGNORE INTO audio_transcriptions_fts(transcription, device, audio_chunk_id, speaker_id, start_time, end_time)
    VALUES (
        NEW.transcription,
        COALESCE(NEW.device, ''),
        NEW.audio_chunk_id,
        NEW.speaker_id,
        NEW.start_time,
        NEW.end_time
    );
END;

CREATE TRIGGER IF NOT EXISTS audio_transcriptions_update AFTER UPDATE ON audio_transcriptions
WHEN NEW.transcription IS NOT NULL AND NEW.transcription != '' AND OLD.audio_chunk_id IS NOT NULL
BEGIN
    UPDATE audio_transcriptions_fts 
    SET transcription = NEW.transcription,
        device = COALESCE(NEW.device, ''),
        start_time = NEW.start_time,
        end_time = NEW.end_time
    WHERE audio_chunk_id = OLD.audio_chunk_id;
END;

CREATE TRIGGER IF NOT EXISTS audio_transcriptions_delete AFTER DELETE ON audio_transcriptions
BEGIN
    DELETE FROM audio_transcriptions_fts 
    WHERE audio_chunk_id = OLD.audio_chunk_id;
END;

PRAGMA foreign_keys = ON;