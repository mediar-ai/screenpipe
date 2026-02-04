-- Add migration script here
-- Start transaction and temporarily disable foreign keys for the migration
PRAGMA foreign_keys = OFF;

-- Add columns to frames
ALTER TABLE frames ADD COLUMN app_name TEXT DEFAULT NULL;
ALTER TABLE frames ADD COLUMN window_name TEXT DEFAULT NULL;
ALTER TABLE frames ADD COLUMN focused BOOLEAN DEFAULT NULL;

-- Update the existing frames_fts table to include new columns
-- First, drop the existing triggers
DROP TRIGGER IF EXISTS frames_ai;
DROP TRIGGER IF EXISTS frames_ad;
DROP TRIGGER IF EXISTS frames_au;

-- Recreate the FTS table with all columns
DROP TABLE IF EXISTS frames_fts;
CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(
    name,
    browser_url,
    app_name,
    window_name,
    focused,
    id UNINDEXED,
    tokenize='unicode61'
);

-- DATA_MIGRATION: This migration only handles schema changes.
-- The actual data migration from ocr_text to frames table should be done 
-- in a background process to avoid blocking database operations.
-- 
-- See the migration worker implementation that:
-- 1. Runs in a separate thread or process
-- 2. Uses small batches with transaction boundaries
-- 3. Has retry logic and progress tracking
-- 4. Can be paused/resumed if needed
-- 5. Properly handles new incoming data during migration

-- Create updated triggers for frames
CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames BEGIN
    INSERT INTO frames_fts(id, name, browser_url, app_name, window_name, focused)
    VALUES (
        NEW.id,
        COALESCE(NEW.name, ''),
        COALESCE(NEW.browser_url, ''),
        COALESCE(NEW.app_name, ''),
        COALESCE(NEW.window_name, ''),
        COALESCE(NEW.focused, 0)
    );
END;

CREATE TRIGGER IF NOT EXISTS frames_au AFTER UPDATE ON frames
WHEN (NEW.name IS NOT NULL AND NEW.name != '')
   OR (NEW.browser_url IS NOT NULL AND NEW.browser_url != '') 
   OR (NEW.app_name IS NOT NULL AND NEW.app_name != '')
   OR (NEW.window_name IS NOT NULL AND NEW.window_name != '')
   OR (NEW.focused IS NOT NULL)
BEGIN
    INSERT OR REPLACE INTO frames_fts(id, name, browser_url, app_name, window_name, focused)
    VALUES (
        NEW.id,
        COALESCE(NEW.name, ''),
        COALESCE(NEW.browser_url, ''),
        COALESCE(NEW.app_name, ''),
        COALESCE(NEW.window_name, ''),
        COALESCE(NEW.focused, 0)
    );
END;

CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames
BEGIN
    DELETE FROM frames_fts 
    WHERE id = OLD.id;
END;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_frames_app_name ON frames(app_name);
CREATE INDEX IF NOT EXISTS idx_frames_window_name ON frames(window_name);
CREATE INDEX IF NOT EXISTS idx_frames_app_window ON frames(app_name, window_name);
CREATE INDEX IF NOT EXISTS idx_frames_browser_url ON frames(browser_url);
CREATE INDEX IF NOT EXISTS idx_frames_focused ON frames(focused);

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
