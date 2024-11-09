CREATE TABLE IF NOT EXISTS ui_monitoring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_output TEXT NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    app TEXT NOT NULL,
    window TEXT NOT NULL,
    initial_traversal_at DATETIME
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_timestamp ON ui_monitoring(timestamp);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_app ON ui_monitoring(app);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_window ON ui_monitoring(window);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_text_output ON ui_monitoring(text_output);

-- Create junction table for UI monitoring and tags
CREATE TABLE IF NOT EXISTS ui_monitoring_tags (
    ui_monitoring_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (ui_monitoring_id, tag_id),
    FOREIGN KEY (ui_monitoring_id) REFERENCES ui_monitoring(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Create indexes for the junction table with IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_tags_ui_id ON ui_monitoring_tags(ui_monitoring_id);
CREATE INDEX IF NOT EXISTS idx_ui_monitoring_tags_tag_id ON ui_monitoring_tags(tag_id);