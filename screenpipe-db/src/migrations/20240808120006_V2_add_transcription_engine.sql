-- Add transcription_engine column to audio_transcriptions table
ALTER TABLE audio_transcriptions ADD COLUMN transcription_engine TEXT NOT NULL DEFAULT 'Whisper';

-- Update existing rows to have 'Whisper' as the default value
UPDATE audio_transcriptions SET transcription_engine = 'Whisper' WHERE transcription_engine IS NULL;