-- Add device and is_input_device columns to audio_transcriptions table
ALTER TABLE audio_transcriptions ADD COLUMN device TEXT NOT NULL DEFAULT '';
ALTER TABLE audio_transcriptions ADD COLUMN is_input_device BOOLEAN NOT NULL DEFAULT TRUE;

-- Create an index on the new device column
CREATE INDEX idx_audio_transcriptions_device ON audio_transcriptions(device);