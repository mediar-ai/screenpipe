-- Add migration script here
-- Add visible_percentage column with a default value of 0.0 (fully hidden)
ALTER TABLE frames ADD COLUMN visible_percentage REAL DEFAULT 0.0;

-- Create an index for the new column to optimize queries
CREATE INDEX IF NOT EXISTS idx_frames_visible_percentage ON frames(visible_percentage);