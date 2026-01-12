-- Add session_id to ocr_text table
ALTER TABLE ocr_text ADD COLUMN session_id INTEGER;

-- Add session_id to audio_transcriptions table
ALTER TABLE audio_transcriptions ADD COLUMN session_id INTEGER;

-- Note: UI monitoring is not wired to sessions in MVP; avoid adding unused columns

-- No indexes for session_id in MVP to keep scope minimal
