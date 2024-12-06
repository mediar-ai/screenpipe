-- Start transaction and temporarily disable foreign keys for the migration
PRAGMA foreign_keys = OFF;

-- Drop existing triggers and FTS tables
DROP TRIGGER IF EXISTS ocr_text_ai;
DROP TRIGGER IF EXISTS audio_transcriptions_ai;
DROP TRIGGER IF EXISTS ui_monitoring_ai;
DROP TABLE IF EXISTS ocr_text_fts;
DROP TABLE IF EXISTS audio_transcriptions_fts;
DROP TABLE IF EXISTS ui_monitoring_fts;

-- Drop legacy triggers
DROP TRIGGER IF EXISTS chunked_text_index_ai;
DROP TRIGGER IF EXISTS chunked_text_index_ad;
DROP TRIGGER IF EXISTS chunked_text_index_au;

-- Create new FTS tables with simpler, more robust configuration
CREATE VIRTUAL TABLE IF NOT EXISTS ocr_text_fts USING fts5(
    text,
    app_name,
    window_name,
    frame_id UNINDEXED,
    tokenize='unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS audio_transcriptions_fts USING fts5(
    transcription,
    device,
    audio_chunk_id UNINDEXED,
    tokenize='unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS ui_monitoring_fts USING fts5(
    text_output,
    app,
    window,
    ui_id UNINDEXED,
    tokenize='unicode61'
);

-- Insert existing data with proper NULL handling
INSERT OR IGNORE INTO ocr_text_fts(frame_id, text, app_name, window_name)
SELECT 
    o.frame_id, 
    COALESCE(o.text, '') as text,
    COALESCE(o.app_name, '') as app_name,
    COALESCE(o.window_name, '') as window_name
FROM ocr_text o
WHERE o.text IS NOT NULL 
  AND o.text != ''
  AND o.frame_id IS NOT NULL;

INSERT OR IGNORE INTO audio_transcriptions_fts(audio_chunk_id, transcription, device)
SELECT 
    audio_chunk_id, 
    COALESCE(transcription, '') as transcription,
    COALESCE(device, '') as device
FROM audio_transcriptions 
WHERE transcription IS NOT NULL 
  AND transcription != ''
  AND audio_chunk_id IS NOT NULL;

INSERT OR IGNORE INTO ui_monitoring_fts(ui_id, text_output, app, window)
SELECT 
    id, 
    COALESCE(text_output, '') as text_output,
    COALESCE(app, '') as app,
    COALESCE(window, '') as window
FROM ui_monitoring 
WHERE text_output IS NOT NULL 
  AND text_output != ''
  AND id IS NOT NULL;

-- Create robust triggers for future inserts
CREATE TRIGGER IF NOT EXISTS ocr_text_ai AFTER INSERT ON ocr_text 
WHEN NEW.text IS NOT NULL AND NEW.text != '' AND NEW.frame_id IS NOT NULL
BEGIN
    INSERT OR IGNORE INTO ocr_text_fts(frame_id, text, app_name, window_name)
    VALUES (
        NEW.frame_id, 
        NEW.text,
        COALESCE(NEW.app_name, ''),
        COALESCE(NEW.window_name, '')
    );
END;

CREATE TRIGGER IF NOT EXISTS audio_transcriptions_ai AFTER INSERT ON audio_transcriptions 
WHEN NEW.transcription IS NOT NULL AND NEW.transcription != '' AND NEW.audio_chunk_id IS NOT NULL
BEGIN
    INSERT OR IGNORE INTO audio_transcriptions_fts(audio_chunk_id, transcription, device)
    VALUES (
        NEW.audio_chunk_id,
        NEW.transcription,
        COALESCE(NEW.device, '')
    );
END;

CREATE TRIGGER IF NOT EXISTS ui_monitoring_ai AFTER INSERT ON ui_monitoring 
WHEN NEW.text_output IS NOT NULL AND NEW.text_output != '' AND NEW.id IS NOT NULL
BEGIN
    INSERT OR IGNORE INTO ui_monitoring_fts(ui_id, text_output, app, window)
    VALUES (
        NEW.id,
        NEW.text_output,
        COALESCE(NEW.app, ''),
        COALESCE(NEW.window, '')
    );
END;

CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_timestamp ON audio_transcriptions(timestamp);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_timestamp ON ui_monitoring(timestamp);

-- Add indexes for UI monitoring timestamp lookups
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_timestamp ON ui_monitoring(timestamp);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_app ON ui_monitoring(app);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_window ON ui_monitoring(window);

-- Add compound indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_app_window ON ui_monitoring(app, window);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_timestamp_app ON ui_monitoring(timestamp, app);

-- Re-enable foreign keys after migration
PRAGMA foreign_keys = ON;

