
-- Create indices for search queries
CREATE INDEX IF NOT EXISTS idx_ocr_text_text ON ocr_text(text);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_transcription ON audio_transcriptions(transcription);
CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_timestamp ON audio_transcriptions(timestamp);

-- Create composite indices for more efficient searching
CREATE INDEX IF NOT EXISTS idx_frames_video_chunk_id_timestamp ON frames(video_chunk_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_audio_chunk_id_timestamp ON audio_transcriptions(audio_chunk_id, timestamp);

