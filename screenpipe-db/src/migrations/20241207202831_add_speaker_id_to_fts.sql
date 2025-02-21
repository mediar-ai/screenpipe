PRAGMA foreign_keys = OFF;

-- Drop existing triggers and FTS tables
DROP TRIGGER IF EXISTS audio_transcriptions_ai;
DROP TABLE IF EXISTS audio_transcriptions_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS audio_transcriptions_fts USING fts5(
    transcription,
    device,
    audio_chunk_id UNINDEXED,
    speaker_id,
    tokenize='unicode61'
);

INSERT OR IGNORE INTO audio_transcriptions_fts(audio_chunk_id, transcription, device, speaker_id)
SELECT 
    audio_chunk_id, 
    COALESCE(transcription, '') as transcription,
    COALESCE(device, '') as device,
    speaker_id
FROM audio_transcriptions 
WHERE transcription IS NOT NULL 
  AND transcription != ''
  AND audio_chunk_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS audio_transcriptions_ai AFTER INSERT ON audio_transcriptions 
WHEN NEW.transcription IS NOT NULL AND NEW.transcription != '' AND NEW.audio_chunk_id IS NOT NULL
BEGIN
    INSERT OR IGNORE INTO audio_transcriptions_fts(audio_chunk_id, transcription, device, speaker_id)
    VALUES (
        NEW.audio_chunk_id,
        NEW.transcription,
        COALESCE(NEW.device, ''),
        NEW.speaker_id
    );
END;

PRAGMA foreign_keys = ON;