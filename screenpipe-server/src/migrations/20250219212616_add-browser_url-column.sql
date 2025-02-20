-- Add migration script here
ALTER TABLE frames ADD COLUMN browser_url TEXT DEFAULT NULL;
