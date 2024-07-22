-- Add new columns to the ocr_text table
ALTER TABLE ocr_text ADD COLUMN text_json TEXT;
ALTER TABLE ocr_text ADD COLUMN new_text_json_vs_previous_frame TEXT;
ALTER TABLE ocr_text ADD COLUMN raw_data_output_from_OCR TEXT;

-- Create indices for the new columns
CREATE INDEX IF NOT EXISTS idx_ocr_text_text_json ON ocr_text(text_json);
CREATE INDEX IF NOT EXISTS idx_ocr_text_new_text_json_vs_previous_frame ON ocr_text(new_text_json_vs_previous_frame);
CREATE INDEX IF NOT EXISTS idx_ocr_text_raw_data_output_from_OCR ON ocr_text(raw_data_output_from_OCR);

-- Delete old columns
ALTER TABLE ocr_text DROP COLUMN Tesseract_TSV_object;
ALTER TABLE ocr_text DROP COLUMN diff_vs_previous_frame_by_line;

-- Rename existing columns
ALTER TABLE ocr_text RENAME COLUMN new_text_json TO new_text_json_vs_previous_frame;
ALTER TABLE ocr_text RENAME COLUMN data_output TO raw_data_output_from_OCR;