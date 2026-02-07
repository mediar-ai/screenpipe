-- Add missing index on video_chunks.device_name
-- This query runs inside BEGIN IMMEDIATE transactions on every frame insert:
--   SELECT id, file_path FROM video_chunks WHERE device_name = ?1 ORDER BY id DESC LIMIT 1
-- Without this index, it's a full table scan holding the write lock.
-- On a DB with weeks of data (thousands of video_chunks rows), this causes
-- multi-second stalls and cascading contention.
CREATE INDEX IF NOT EXISTS idx_video_chunks_device_name ON video_chunks(device_name);

-- Also add a compound index for the exact query pattern (device_name + id DESC)
-- SQLite can use this to satisfy both the WHERE and ORDER BY in a single index scan.
CREATE INDEX IF NOT EXISTS idx_video_chunks_device_name_id ON video_chunks(device_name, id DESC);
