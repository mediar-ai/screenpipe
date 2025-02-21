-- Add migration script here

-- For the frames query optimization
CREATE INDEX IF NOT EXISTS idx_frames_timestamp_offset_index ON frames(timestamp, offset_index);
CREATE INDEX IF NOT EXISTS idx_ocr_text_frame_id ON ocr_text(frame_id);

-- Composite index for ocr_text that might help with the LEFT JOIN
CREATE INDEX IF NOT EXISTS idx_ocr_text_frame_app_window ON ocr_text(frame_id, app_name, window_name);

