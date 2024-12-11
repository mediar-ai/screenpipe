-- Check SQLite version first
SELECT CASE 
    WHEN sqlite_version() < '3.9.0' THEN
        RAISE(ABORT, 'SQLite version 3.9.0 or higher required for FTS5')
    END;

-- Start transaction and temporarily disable foreign keys for the migration
PRAGMA foreign_keys = OFF;

-- Drop existing update/delete triggers if they exist
DROP TRIGGER IF EXISTS ocr_text_au;
DROP TRIGGER IF EXISTS ocr_text_ad;
DROP TRIGGER IF EXISTS audio_transcriptions_au;
DROP TRIGGER IF EXISTS audio_transcriptions_ad;
DROP TRIGGER IF EXISTS ui_monitoring_au;
DROP TRIGGER IF EXISTS ui_monitoring_ad;

-- Create update trigger for ocr_text
CREATE TRIGGER IF NOT EXISTS ocr_text_au AFTER UPDATE ON ocr_text 
WHEN NEW.text IS NOT NULL AND NEW.text != '' AND NEW.frame_id IS NOT NULL
BEGIN
    DELETE FROM ocr_text_fts WHERE frame_id = OLD.frame_id;
    INSERT OR ROLLBACK INTO ocr_text_fts(frame_id, text, app_name, window_name)
    VALUES (
        NEW.frame_id,
        NEW.text,
        COALESCE(NEW.app_name, ''),
        COALESCE(NEW.window_name, '')
    );
END;

-- Create delete trigger for ocr_text
CREATE TRIGGER IF NOT EXISTS ocr_text_ad AFTER DELETE ON ocr_text 
WHEN OLD.text IS NOT NULL AND OLD.text != '' AND OLD.frame_id IS NOT NULL
BEGIN
    DELETE FROM ocr_text_fts WHERE frame_id = OLD.frame_id;
END;

-- Create update trigger for audio_transcriptions
CREATE TRIGGER IF NOT EXISTS audio_transcriptions_au AFTER UPDATE ON audio_transcriptions 
WHEN NEW.transcription IS NOT NULL AND NEW.transcription != '' AND NEW.audio_chunk_id IS NOT NULL
BEGIN
    DELETE FROM audio_transcriptions_fts WHERE audio_chunk_id = OLD.audio_chunk_id;
    INSERT OR ROLLBACK INTO audio_transcriptions_fts(audio_chunk_id, transcription, device)
    VALUES (
        NEW.audio_chunk_id,
        NEW.transcription,
        COALESCE(NEW.device, '')
    );
END;

-- Create delete trigger for audio_transcriptions
CREATE TRIGGER IF NOT EXISTS audio_transcriptions_ad AFTER DELETE ON audio_transcriptions 
WHEN OLD.transcription IS NOT NULL AND OLD.transcription != '' AND OLD.audio_chunk_id IS NOT NULL
BEGIN
    DELETE FROM audio_transcriptions_fts WHERE audio_chunk_id = OLD.audio_chunk_id;
END;

-- Create update trigger for ui_monitoring
CREATE TRIGGER IF NOT EXISTS ui_monitoring_au AFTER UPDATE ON ui_monitoring 
WHEN NEW.text_output IS NOT NULL AND NEW.text_output != '' AND NEW.id IS NOT NULL
BEGIN
    DELETE FROM ui_monitoring_fts WHERE ui_id = OLD.id;
    INSERT OR ROLLBACK INTO ui_monitoring_fts(ui_id, text_output, app, window)
    VALUES (
        NEW.id,
        NEW.text_output,
        COALESCE(NEW.app, ''),
        COALESCE(NEW.window, '')
    );
END;

-- Create delete trigger for ui_monitoring
CREATE TRIGGER IF NOT EXISTS ui_monitoring_ad AFTER DELETE ON ui_monitoring 
WHEN OLD.text_output IS NOT NULL AND OLD.text_output != '' AND OLD.id IS NOT NULL
BEGIN
    DELETE FROM ui_monitoring_fts WHERE ui_id = OLD.id;
END;

-- Re-enable foreign keys after migration
PRAGMA foreign_keys = ON; 