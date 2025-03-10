-- Add migration script here
-- Add window_name column to ocr_text table
ALTER TABLE ocr_text ADD COLUMN window_name TEXT;