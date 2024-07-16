-- Add migration script here


ALTER TABLE frames ADD COLUMN metadata TEXT;
ALTER TABLE audio_transcriptions ADD COLUMN metadata TEXT;

-- Create indices for faster metadata searches
CREATE INDEX IF NOT EXISTS idx_frames_metadata ON frames(metadata);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_metadata ON audio_transcriptions(metadata);

