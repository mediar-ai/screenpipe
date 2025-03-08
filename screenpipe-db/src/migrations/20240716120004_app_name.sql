-- Add migration script here
-- Add app_name column to frames table
ALTER TABLE frames ADD COLUMN app_name TEXT NOT NULL DEFAULT '';
ALTER TABLE ocr_text ADD COLUMN app_name TEXT NOT NULL DEFAULT '';