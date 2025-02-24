-- Add migration script here
-- Start transaction and temporarily disable foreign keys for the migration
PRAGMA foreign_keys = OFF;

-- Add columns to frames
ALTER TABLE frames ADD COLUMN app_name TEXT DEFAULT NULL;
ALTER TABLE frames ADD COLUMN window_name TEXT DEFAULT NULL;
ALTER TABLE frames ADD COLUMN focused BOOLEAN DEFAULT NULL;

-- Create frames FTS
CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(
    browser_url,
    app_name,
    window_name,
    focused,
    rowid UNINDEXED,
    tokenize='unicode61'
);

-- Create triggers for frames
CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames 
WHEN (NEW.browser_url IS NOT NULL AND NEW.browser_url != '') 
   OR (NEW.app_name IS NOT NULL AND NEW.app_name != '')
   OR (NEW.window_name IS NOT NULL AND NEW.window_name != '')
   OR (NEW.focused IS NOT NULL)
BEGIN
    INSERT OR IGNORE INTO frames_fts(rowid, browser_url, app_name, window_name, focused)
    VALUES (
        NEW.id,
        COALESCE(NEW.browser_url, ''),
        COALESCE(NEW.app_name, ''),
        COALESCE(NEW.window_name, ''),
        COALESCE(NEW.focused, 0)
    );
END;

CREATE TRIGGER IF NOT EXISTS frames_au AFTER UPDATE ON frames
WHEN (NEW.browser_url IS NOT NULL AND NEW.browser_url != '') 
   OR (NEW.app_name IS NOT NULL AND NEW.app_name != '')
   OR (NEW.window_name IS NOT NULL AND NEW.window_name != '')
   OR (NEW.focused IS NOT NULL)
BEGIN
    UPDATE frames_fts 
    SET browser_url = COALESCE(NEW.browser_url, ''),
        app_name = COALESCE(NEW.app_name, ''),
        window_name = COALESCE(NEW.window_name, ''),
        focused = COALESCE(NEW.focused, 0)
    WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames
BEGIN
    DELETE FROM frames_fts 
    WHERE rowid = OLD.id;
END;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_frames_app_name ON frames(app_name);
CREATE INDEX IF NOT EXISTS idx_frames_window_name ON frames(window_name);
CREATE INDEX IF NOT EXISTS idx_frames_app_window ON frames(app_name, window_name);
CREATE INDEX IF NOT EXISTS idx_frames_browser_url ON frames(browser_url);
CREATE INDEX IF NOT EXISTS idx_frames_focused ON frames(focused);

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
