-- Backfill NULL fps values for users who got the nullable version of the fps migration (v0.3.130).
-- The column was later changed to NOT NULL DEFAULT 0.5 (v0.3.131+), but users who ran v0.3.130
-- have NULL values for pre-existing rows. This ensures consistent data regardless of upgrade path.
UPDATE video_chunks SET fps = 0.5 WHERE fps IS NULL;
