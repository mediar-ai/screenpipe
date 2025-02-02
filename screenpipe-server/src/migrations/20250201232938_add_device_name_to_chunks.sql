-- Add migration script here
ALTER TABLE frames ADD COLUMN device_name TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_frames_device_name ON frames(device_name);