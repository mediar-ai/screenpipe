-- Add migration script here
ALTER TABLE frames ADD COLUMN monitor_device TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_frames_monitor_device ON frames(monitor_device);