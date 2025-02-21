-- Start transaction and temporarily disable foreign keys for the migration
PRAGMA foreign_keys = OFF;

-- Add UPDATE and DELETE triggers for ocr_text
CREATE TRIGGER IF NOT EXISTS ocr_text_update AFTER UPDATE ON ocr_text
WHEN NEW.text IS NOT NULL AND NEW.text != '' AND OLD.frame_id IS NOT NULL
BEGIN
    UPDATE ocr_text_fts 
    SET text = NEW.text, 
        app_name = COALESCE(NEW.app_name, ''), 
        window_name = COALESCE(NEW.window_name, '')
    WHERE frame_id = OLD.frame_id;
END;

CREATE TRIGGER IF NOT EXISTS ocr_text_delete AFTER DELETE ON ocr_text
BEGIN
    DELETE FROM ocr_text_fts 
    WHERE frame_id = OLD.frame_id;
END;

-- Add UPDATE and DELETE triggers for audio_transcriptions
CREATE TRIGGER IF NOT EXISTS audio_transcriptions_update AFTER UPDATE ON audio_transcriptions
WHEN NEW.transcription IS NOT NULL AND NEW.transcription != '' AND OLD.audio_chunk_id IS NOT NULL
BEGIN
    UPDATE audio_transcriptions_fts 
    SET transcription = NEW.transcription,
        device = COALESCE(NEW.device, '')
    WHERE audio_chunk_id = OLD.audio_chunk_id;
END;

CREATE TRIGGER IF NOT EXISTS audio_transcriptions_delete AFTER DELETE ON audio_transcriptions
BEGIN
    DELETE FROM audio_transcriptions_fts 
    WHERE audio_chunk_id = OLD.audio_chunk_id;
END;

-- Add UPDATE and DELETE triggers for ui_monitoring
CREATE TRIGGER IF NOT EXISTS ui_monitoring_update AFTER UPDATE ON ui_monitoring
WHEN NEW.text_output IS NOT NULL AND NEW.text_output != '' AND OLD.id IS NOT NULL
BEGIN
    UPDATE ui_monitoring_fts 
    SET text_output = NEW.text_output,
        app = COALESCE(NEW.app, ''),
        window = COALESCE(NEW.window, '')
    WHERE ui_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS ui_monitoring_delete AFTER DELETE ON ui_monitoring
BEGIN
    DELETE FROM ui_monitoring_fts 
    WHERE ui_id = OLD.id;
END;

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
