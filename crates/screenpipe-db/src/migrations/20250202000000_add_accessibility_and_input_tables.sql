-- Add accessibility table (replaces ui_monitoring with better name and sync support)
-- and ui_events table for input capture

-- =============================================================================
-- ACCESSIBILITY TABLE (screen content from accessibility APIs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS accessibility (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    app_name TEXT NOT NULL,
    window_name TEXT NOT NULL,
    text_content TEXT NOT NULL,
    browser_url TEXT,
    -- Sync columns
    sync_id TEXT,
    machine_id TEXT,
    synced_at DATETIME
);

-- Indexes for accessibility
CREATE INDEX IF NOT EXISTS idx_accessibility_timestamp ON accessibility(timestamp);
CREATE INDEX IF NOT EXISTS idx_accessibility_app_name ON accessibility(app_name);
CREATE INDEX IF NOT EXISTS idx_accessibility_window_name ON accessibility(window_name);
CREATE INDEX IF NOT EXISTS idx_accessibility_sync_id ON accessibility(sync_id);
CREATE INDEX IF NOT EXISTS idx_accessibility_synced_at ON accessibility(synced_at);
CREATE INDEX IF NOT EXISTS idx_accessibility_unsynced ON accessibility(synced_at) WHERE synced_at IS NULL;

-- FTS for accessibility
CREATE VIRTUAL TABLE IF NOT EXISTS accessibility_fts USING fts5(
    text_content,
    app_name,
    window_name,
    content='accessibility',
    content_rowid='id',
    tokenize='unicode61'
);

-- Triggers for accessibility FTS
CREATE TRIGGER IF NOT EXISTS accessibility_ai AFTER INSERT ON accessibility BEGIN
    INSERT INTO accessibility_fts(rowid, text_content, app_name, window_name)
    VALUES (NEW.id, NEW.text_content, NEW.app_name, NEW.window_name);
END;

CREATE TRIGGER IF NOT EXISTS accessibility_ad AFTER DELETE ON accessibility BEGIN
    INSERT INTO accessibility_fts(accessibility_fts, rowid, text_content, app_name, window_name)
    VALUES('delete', OLD.id, OLD.text_content, OLD.app_name, OLD.window_name);
END;

CREATE TRIGGER IF NOT EXISTS accessibility_au AFTER UPDATE ON accessibility BEGIN
    INSERT INTO accessibility_fts(accessibility_fts, rowid, text_content, app_name, window_name)
    VALUES('delete', OLD.id, OLD.text_content, OLD.app_name, OLD.window_name);
    INSERT INTO accessibility_fts(rowid, text_content, app_name, window_name)
    VALUES (NEW.id, NEW.text_content, NEW.app_name, NEW.window_name);
END;

-- Junction table for accessibility and tags
CREATE TABLE IF NOT EXISTS accessibility_tags (
    accessibility_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (accessibility_id, tag_id),
    FOREIGN KEY (accessibility_id) REFERENCES accessibility(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accessibility_tags_accessibility_id ON accessibility_tags(accessibility_id);
CREATE INDEX IF NOT EXISTS idx_accessibility_tags_tag_id ON accessibility_tags(tag_id);

-- =============================================================================
-- UI_EVENTS TABLE (user input actions: clicks, keystrokes, clipboard)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ui_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT,
    relative_ms INTEGER NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,  -- click, move, scroll, key, text, app_switch, window_focus, clipboard
    -- Position
    x INTEGER,
    y INTEGER,
    delta_x INTEGER,
    delta_y INTEGER,
    -- Mouse/key
    button INTEGER,
    click_count INTEGER,
    key_code INTEGER,
    modifiers INTEGER,
    -- Text content
    text_content TEXT,
    text_length INTEGER,
    -- App context
    app_name TEXT,
    app_pid INTEGER,
    window_title TEXT,
    browser_url TEXT,
    -- Element context (from accessibility APIs)
    element_role TEXT,
    element_name TEXT,
    element_value TEXT,
    element_description TEXT,
    element_automation_id TEXT,
    element_bounds TEXT,  -- JSON: {"x":0,"y":0,"width":100,"height":50}
    -- Frame correlation
    frame_id INTEGER,
    -- Sync columns
    sync_id TEXT,
    machine_id TEXT,
    synced_at DATETIME
);

-- Indexes for ui_events
CREATE INDEX IF NOT EXISTS idx_ui_events_timestamp ON ui_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_ui_events_event_type ON ui_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ui_events_app_name ON ui_events(app_name);
CREATE INDEX IF NOT EXISTS idx_ui_events_session_id ON ui_events(session_id);
CREATE INDEX IF NOT EXISTS idx_ui_events_frame_id ON ui_events(frame_id);
CREATE INDEX IF NOT EXISTS idx_ui_events_sync_id ON ui_events(sync_id);
CREATE INDEX IF NOT EXISTS idx_ui_events_synced_at ON ui_events(synced_at);
CREATE INDEX IF NOT EXISTS idx_ui_events_unsynced ON ui_events(synced_at) WHERE synced_at IS NULL;

-- FTS for ui_events (searchable text content)
CREATE VIRTUAL TABLE IF NOT EXISTS ui_events_fts USING fts5(
    text_content,
    app_name,
    window_title,
    element_name,
    content='ui_events',
    content_rowid='id',
    tokenize='unicode61'
);

-- Triggers for ui_events FTS
CREATE TRIGGER IF NOT EXISTS ui_events_ai AFTER INSERT ON ui_events BEGIN
    INSERT INTO ui_events_fts(rowid, text_content, app_name, window_title, element_name)
    VALUES (NEW.id, NEW.text_content, NEW.app_name, NEW.window_title, NEW.element_name);
END;

CREATE TRIGGER IF NOT EXISTS ui_events_ad AFTER DELETE ON ui_events BEGIN
    INSERT INTO ui_events_fts(ui_events_fts, rowid, text_content, app_name, window_title, element_name)
    VALUES('delete', OLD.id, OLD.text_content, OLD.app_name, OLD.window_title, OLD.element_name);
END;

CREATE TRIGGER IF NOT EXISTS ui_events_au AFTER UPDATE ON ui_events BEGIN
    INSERT INTO ui_events_fts(ui_events_fts, rowid, text_content, app_name, window_title, element_name)
    VALUES('delete', OLD.id, OLD.text_content, OLD.app_name, OLD.window_title, OLD.element_name);
    INSERT INTO ui_events_fts(rowid, text_content, app_name, window_title, element_name)
    VALUES (NEW.id, NEW.text_content, NEW.app_name, NEW.window_title, NEW.element_name);
END;

-- =============================================================================
-- Note: ui_monitoring table is deprecated in favor of ui_events
-- Sync columns are only on the new ui_events table
-- =============================================================================
