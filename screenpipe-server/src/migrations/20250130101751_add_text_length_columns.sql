-- Add text_length columns to relevant tables
ALTER TABLE ocr_text ADD COLUMN text_length INTEGER;
ALTER TABLE audio_transcriptions ADD COLUMN text_length INTEGER;
ALTER TABLE ui_monitoring ADD COLUMN text_length INTEGER;

-- Create indexes on the new text_length columns
CREATE INDEX idx_ocr_text_length ON ocr_text (text_length);
CREATE INDEX idx_audio_transcriptions_length ON audio_transcriptions (text_length);
CREATE INDEX idx_ui_monitoring_length ON ui_monitoring (text_length);

-- Update existing records with text lengths
UPDATE ocr_text SET text_length = LENGTH(text);
UPDATE audio_transcriptions SET text_length = LENGTH(transcription);
UPDATE ui_monitoring SET text_length = LENGTH(text_output);

-- Trigger to keep the text_length column up to date for ocr_text
CREATE TRIGGER IF NOT EXISTS ocr_text_ai AFTER INSERT ON ocr_text BEGIN
  UPDATE ocr_text SET text_length = LENGTH(NEW.text) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS ocr_text_au AFTER UPDATE OF text ON ocr_text BEGIN
  UPDATE ocr_text SET text_length = LENGTH(NEW.text) WHERE id = NEW.id;
END;

-- Trigger to keep the text_length column up to date for audio_transcriptions
CREATE TRIGGER IF NOT EXISTS audio_transcriptions_ai AFTER INSERT ON audio_transcriptions BEGIN
  UPDATE audio_transcriptions SET text_length = LENGTH(NEW.transcription) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS audio_transcriptions_au AFTER UPDATE OF transcription ON audio_transcriptions BEGIN
  UPDATE audio_transcriptions SET text_length = LENGTH(NEW.transcription) WHERE id = NEW.id;
END;

-- Trigger to keep the text_length column up to date for ui_monitoring
CREATE TRIGGER IF NOT EXISTS ui_monitoring_ai AFTER INSERT ON ui_monitoring BEGIN
  UPDATE ui_monitoring SET text_length = LENGTH(NEW.text_output) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS ui_monitoring_au AFTER UPDATE OF text_output ON ui_monitoring BEGIN
  UPDATE ui_monitoring SET text_length = LENGTH(NEW.text_output) WHERE id = NEW.id;
END;
