-- Add migration script here

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


-- Create FTS tables
CREATE VIRTUAL TABLE ocr_text_fts USING fts5(
    frame_id UNINDEXED,
    text,
    app_name,
    window_name,
    content=ocr_text
);

CREATE VIRTUAL TABLE audio_transcriptions_fts USING fts5(
    audio_chunk_id UNINDEXED,
    transcription,
    device UNINDEXED,
    content=audio_transcriptions
);

CREATE VIRTUAL TABLE ui_monitoring_fts USING fts5(
    ui_id UNINDEXED,
    text_output,
    app,
    window,
    content=ui_monitoring
);


-- Populate ocr_text_fts
INSERT INTO ocr_text_fts (frame_id, text, app_name, window_name)
SELECT frame_id, text, app_name, window_name FROM ocr_text;

-- Populate audio_transcriptions_fts
INSERT INTO audio_transcriptions_fts (audio_chunk_id, transcription, device)
SELECT audio_chunk_id, transcription, device FROM audio_transcriptions;

-- Populate ui_monitoring_fts
INSERT INTO ui_monitoring_fts (ui_id, text_output, app, window)
SELECT id, text_output, app, window FROM ui_monitoring;

-- Create triggers to keep FTS tables in sync
CREATE TRIGGER ocr_text_ai AFTER INSERT ON ocr_text BEGIN
  INSERT INTO ocr_text_fts(frame_id, text, app_name, window_name)
  VALUES (new.frame_id, new.text, new.app_name, new.window_name);
END;

CREATE TRIGGER audio_transcriptions_ai AFTER INSERT ON audio_transcriptions BEGIN
  INSERT INTO audio_transcriptions_fts(audio_chunk_id, transcription, device)
  VALUES (new.audio_chunk_id, new.transcription, new.device);
END;

CREATE TRIGGER ui_monitoring_ai AFTER INSERT ON ui_monitoring BEGIN
  INSERT INTO ui_monitoring_fts(ui_id, text_output, app, window)
  VALUES (new.id, new.text_output, new.app, new.window);
END;

