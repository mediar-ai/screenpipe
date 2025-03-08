-- Add migration script here
ALTER TABLE ocr_text ADD COLUMN focused BOOLEAN DEFAULT FALSE;