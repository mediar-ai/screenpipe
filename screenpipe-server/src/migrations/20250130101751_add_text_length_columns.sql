-- Add text_length columns to relevant tables
ALTER TABLE ocr_text ADD COLUMN text_length INTEGER;
ALTER TABLE audio_transcriptions ADD COLUMN text_length INTEGER;
ALTER TABLE ui_monitoring ADD COLUMN text_length INTEGER;

-- Create indexes on the new text_length columns
CREATE INDEX idx_ocr_text_length ON ocr_text (text_length);
CREATE INDEX idx_audio_transcriptions_length ON audio_transcriptions (text_length);
CREATE INDEX idx_ui_monitoring_length ON ui_monitoring (text_length);


