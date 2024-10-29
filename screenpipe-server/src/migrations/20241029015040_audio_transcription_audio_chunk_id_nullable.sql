ALTER TABLE audio_transcriptions RENAME TO audio_transcriptions_old;

CREATE TABLE audio_transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audio_chunk_id INTEGER,
    transcription TEXT NOT NULL,
    offset_index INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    transcription_engine TEXT NOT NULL DEFAULT 'Whisper',
    device TEXT NOT NULL DEFAULT '',
    is_input_device BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (audio_chunk_id) REFERENCES audio_chunks(id)
);

DROP INDEX IF EXISTS idx_audio_transcriptions_device; 
DROP INDEX IF EXISTS idx_audio_transcriptions_transcription; 
DROP INDEX IF EXISTS idx_audio_transcriptions_timestamp; 
DROP INDEX IF EXISTS idx_audio_transcriptions_audio_chunk_id_timestamp; 

CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_device ON audio_transcriptions(device);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_transcription ON audio_transcriptions(transcription);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_timestamp ON audio_transcriptions(timestamp);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_audio_chunk_id_timestamp ON audio_transcriptions(audio_chunk_id, timestamp);

INSERT INTO audio_transcriptions (id, audio_chunk_id, transcription, offset_index, timestamp, transcription_engine, device, is_input_device)
SELECT id, audio_chunk_id, transcription, offset_index, timestamp, transcription_engine, device, is_input_device
FROM audio_transcriptions_old;

DROP TABLE audio_transcriptions_old;
