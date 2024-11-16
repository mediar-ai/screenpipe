-- Add device and is_input_device columns to audio_transcriptions table
ALTER TABLE audio_transcriptions ADD COLUMN device TEXT NOT NULL DEFAULT '';
ALTER TABLE audio_transcriptions ADD COLUMN is_input_device BOOLEAN NOT NULL DEFAULT TRUE;

-- Create an index on the new device column
CREATE INDEX idx_audio_transcriptions_device ON audio_transcriptions(device);

-- Add speaker identification table
CREATE TABLE IF NOT EXISTS speaker_identifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audio_chunk_id INTEGER NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    speaker TEXT NOT NULL,
    FOREIGN KEY (audio_chunk_id) REFERENCES audio_chunks(id)
);

-- Create an index on the audio_chunk_id column in speaker_identifications table
CREATE INDEX idx_speaker_identifications_audio_chunk_id ON speaker_identifications(audio_chunk_id);
