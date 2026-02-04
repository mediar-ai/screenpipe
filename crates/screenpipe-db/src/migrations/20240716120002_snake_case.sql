ALTER TABLE ocr_text RENAME COLUMN raw_data_output_from_OCR TO raw_data_output_from_ocr;
DROP INDEX IF EXISTS idx_ocr_text_raw_data_output_from_OCR; 
CREATE INDEX IF NOT EXISTS idx_ocr_text_raw_data_output_from_ocr ON ocr_text(raw_data_output_from_ocr);
