-- Start transaction and temporarily disable foreign keys for the migration
PRAGMA foreign_keys = OFF;

-- Drop existing triggers and FTS tables
DROP TRIGGER IF EXISTS ocr_text_ai;
DROP TRIGGER IF EXISTS audio_transcriptions_ai;
DROP TRIGGER IF EXISTS ui_monitoring_ai;
DROP TABLE IF EXISTS ocr_text_fts;
DROP TABLE IF EXISTS audio_transcriptions_fts;
DROP TABLE IF EXISTS ui_monitoring_fts;

-- Drop legacy tables and triggers
DROP TABLE IF EXISTS chunked_text_index;
DROP TABLE IF EXISTS chunked_text_entries;
DROP TABLE IF EXISTS chunked_text_index_fts;
DROP TABLE IF EXISTS chunked_text_index_fts_data;
DROP TABLE IF EXISTS chunked_text_index_fts_idx;
DROP TABLE IF EXISTS chunked_text_index_fts_content;
DROP TABLE IF EXISTS chunked_text_index_fts_docsize;
DROP TABLE IF EXISTS chunked_text_index_fts_config;
DROP TRIGGER IF EXISTS chunked_text_index_ai;
DROP TRIGGER IF EXISTS chunked_text_index_ad;
DROP TRIGGER IF EXISTS chunked_text_index_au;

-- Create new FTS tables without external content tables
CREATE VIRTUAL TABLE IF NOT EXISTS ocr_text_fts USING fts5(
    text,
    app_name,
    window_name,
    frame_id UNINDEXED,
    content='',
    tokenize='porter unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS audio_transcriptions_fts USING fts5(
    transcription,
    device,
    audio_chunk_id UNINDEXED,
    content='',
    tokenize='porter unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS ui_monitoring_fts USING fts5(
    text_output,
    app,
    window,
    ui_id UNINDEXED,
    content='',
    tokenize='porter unicode61 remove_diacritics 2'
);

-- Insert existing data in batches to avoid memory issues
INSERT OR IGNORE INTO ocr_text_fts(frame_id, text, app_name, window_name)
SELECT o.frame_id, o.text, COALESCE(o.app_name, ''), COALESCE(o.window_name, '')
FROM ocr_text o
WHERE o.text IS NOT NULL AND o.text != ''
LIMIT 1000;

WHILE (SELECT changes()) > 0 DO
  INSERT OR IGNORE INTO ocr_text_fts(frame_id, text, app_name, window_name)
  SELECT o.frame_id, o.text, COALESCE(o.app_name, ''), COALESCE(o.window_name, '')
  FROM ocr_text o
  WHERE o.text IS NOT NULL AND o.text != ''
  AND NOT EXISTS (SELECT 1 FROM ocr_text_fts f WHERE f.frame_id = o.frame_id)
  LIMIT 1000;
END;

INSERT OR IGNORE INTO audio_transcriptions_fts(audio_chunk_id, transcription, device)
SELECT audio_chunk_id, transcription, COALESCE(device, '')
FROM audio_transcriptions 
WHERE transcription IS NOT NULL AND transcription != '';

INSERT OR IGNORE INTO ui_monitoring_fts(ui_id, text_output, app, window)
SELECT id, text_output, COALESCE(app, ''), COALESCE(window, '')
FROM ui_monitoring 
WHERE text_output IS NOT NULL AND text_output != '';

-- Create triggers for future inserts
CREATE TRIGGER IF NOT EXISTS ocr_text_ai AFTER INSERT ON ocr_text 
WHEN NEW.text IS NOT NULL AND NEW.text != ''
BEGIN
    INSERT OR IGNORE INTO ocr_text_fts(frame_id, text, app_name, window_name)
    VALUES (NEW.frame_id, NEW.text, COALESCE(NEW.app_name, ''), COALESCE(NEW.window_name, ''));
END;

CREATE TRIGGER IF NOT EXISTS audio_transcriptions_ai AFTER INSERT ON audio_transcriptions 
WHEN NEW.transcription IS NOT NULL AND NEW.transcription != ''
BEGIN
    INSERT OR IGNORE INTO audio_transcriptions_fts(audio_chunk_id, transcription, device)
    VALUES (NEW.audio_chunk_id, NEW.transcription, COALESCE(NEW.device, ''));
END;

CREATE TRIGGER IF NOT EXISTS ui_monitoring_ai AFTER INSERT ON ui_monitoring 
WHEN NEW.text_output IS NOT NULL AND NEW.text_output != ''
BEGIN
    INSERT OR IGNORE INTO ui_monitoring_fts(ui_id, text_output, app, window)
    VALUES (NEW.id, NEW.text_output, COALESCE(NEW.app, ''), COALESCE(NEW.window, ''));
END;


-- Re-enable foreign keys after migration
PRAGMA foreign_keys = ON;



