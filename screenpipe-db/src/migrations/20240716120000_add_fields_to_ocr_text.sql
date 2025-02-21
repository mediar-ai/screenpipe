-- Add new columns to the ocr_text table
ALTER TABLE ocr_text ADD COLUMN Tesseract_TSV_object TEXT;
ALTER TABLE ocr_text ADD COLUMN unique_text_lines_24hr TEXT;
ALTER TABLE ocr_text ADD COLUMN unique_text_lines_1hr TEXT;
ALTER TABLE ocr_text ADD COLUMN unique_text_lines_1m TEXT;
ALTER TABLE ocr_text ADD COLUMN diff_vs_previous_frame_by_line TEXT;

-- Create indices for the new columns
CREATE INDEX IF NOT EXISTS idx_ocr_text_Tesseract_TSV_object ON ocr_text(Tesseract_TSV_object);
CREATE INDEX IF NOT EXISTS idx_ocr_text_unique_text_lines_24hr ON ocr_text(unique_text_lines_24hr);
CREATE INDEX IF NOT EXISTS idx_ocr_text_unique_text_lines_1hr ON ocr_text(unique_text_lines_1hr);
CREATE INDEX IF NOT EXISTS idx_ocr_text_unique_text_lines_1m ON ocr_text(unique_text_lines_1m);
CREATE INDEX IF NOT EXISTS idx_ocr_text_diff_vs_previous_frame_by_line ON ocr_text(diff_vs_previous_frame_by_line);