-- Add migration script here
-- Add timestamp column to audio_chunks table
ALTER TABLE audio_chunks ADD COLUMN timestamp TIMESTAMP;

-- Create an index on the new timestamp column
CREATE INDEX idx_audio_chunks_timestamp ON audio_chunks(timestamp);