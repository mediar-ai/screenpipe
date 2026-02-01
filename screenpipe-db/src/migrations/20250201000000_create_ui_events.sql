-- UI Events table for storing keyboard, mouse, and accessibility events
-- This is the third modality alongside OCR (vision) and audio

CREATE TABLE IF NOT EXISTS ui_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Timing
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT,                     -- UUID for recording session
    relative_ms INTEGER NOT NULL,        -- ms since session start

    -- Event type
    event_type TEXT NOT NULL,            -- click, move, scroll, key, text, app_switch, window_focus, clipboard

    -- Position data (for mouse events)
    x INTEGER,
    y INTEGER,
    delta_x INTEGER,                     -- scroll/drag delta
    delta_y INTEGER,

    -- Mouse/key data
    button INTEGER,                      -- 0=left, 1=right, 2=middle
    click_count INTEGER DEFAULT 1,       -- 1=single, 2=double
    key_code INTEGER,
    modifiers INTEGER,                   -- packed: 1=shift, 2=ctrl, 4=opt, 8=cmd

    -- Text content
    text_content TEXT,
    text_length INTEGER,                 -- Denormalized for queries

    -- App/Window context
    app_name TEXT,
    app_pid INTEGER,
    window_title TEXT,
    browser_url TEXT,

    -- Element context (from accessibility)
    element_role TEXT,                   -- AXButton, AXTextField, etc.
    element_name TEXT,                   -- Accessible name/label
    element_value TEXT,                  -- Current value (for inputs)
    element_description TEXT,
    element_automation_id TEXT,          -- Windows automation ID
    element_bounds TEXT,                 -- JSON: {"x":0,"y":0,"width":100,"height":50}

    -- Frame correlation
    frame_id INTEGER,
    FOREIGN KEY (frame_id) REFERENCES frames(id)
);

-- FTS index for semantic search
CREATE VIRTUAL TABLE IF NOT EXISTS ui_events_fts USING fts5(
    text_content,
    app_name,
    window_title,
    element_name,
    element_value,
    content='ui_events',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_ui_events_timestamp ON ui_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ui_events_type ON ui_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ui_events_app ON ui_events(app_name);
CREATE INDEX IF NOT EXISTS idx_ui_events_role ON ui_events(element_role);
CREATE INDEX IF NOT EXISTS idx_ui_events_frame ON ui_events(frame_id);

-- Compound index for common queries
CREATE INDEX IF NOT EXISTS idx_ui_events_app_type_time
    ON ui_events(app_name, event_type, timestamp DESC);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS ui_events_ai AFTER INSERT ON ui_events BEGIN
    INSERT INTO ui_events_fts(rowid, text_content, app_name, window_title, element_name, element_value)
    VALUES (new.id, new.text_content, new.app_name, new.window_title, new.element_name, new.element_value);
END;

CREATE TRIGGER IF NOT EXISTS ui_events_ad AFTER DELETE ON ui_events BEGIN
    INSERT INTO ui_events_fts(ui_events_fts, rowid, text_content, app_name, window_title, element_name, element_value)
    VALUES ('delete', old.id, old.text_content, old.app_name, old.window_title, old.element_name, old.element_value);
END;

CREATE TRIGGER IF NOT EXISTS ui_events_au AFTER UPDATE ON ui_events BEGIN
    INSERT INTO ui_events_fts(ui_events_fts, rowid, text_content, app_name, window_title, element_name, element_value)
    VALUES ('delete', old.id, old.text_content, old.app_name, old.window_title, old.element_name, old.element_value);
    INSERT INTO ui_events_fts(rowid, text_content, app_name, window_title, element_name, element_value)
    VALUES (new.id, new.text_content, new.app_name, new.window_title, new.element_name, new.element_value);
END;

-- Daily stats table for dashboard
CREATE TABLE IF NOT EXISTS ui_event_stats (
    date DATE NOT NULL,
    app_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (date, app_name, event_type)
);
