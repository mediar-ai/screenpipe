-- Add to the "up" migration
DROP INDEX IF EXISTS idx_ocr_text_raw_data_output_from_ocr;
DROP INDEX IF EXISTS idx_ocr_text_Tesseract_TSV_object;
DROP INDEX IF EXISTS idx_ocr_text_unique_text_lines_24hr;
DROP INDEX IF EXISTS idx_ocr_text_unique_text_lines_1hr;
DROP INDEX IF EXISTS idx_ocr_text_unique_text_lines_1m;
DROP INDEX IF EXISTS idx_ocr_text_diff_vs_previous_frame_by_line;

-- Add to the "down" migration (optional, if you want to be able to revert)
-- You can leave this empty or add commands to recreate the indexes if needed