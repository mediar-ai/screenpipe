-- Add migration script here

ALTER TABLE ocr_text ADD COLUMN browser_url TEXT DEFAULT NULL;