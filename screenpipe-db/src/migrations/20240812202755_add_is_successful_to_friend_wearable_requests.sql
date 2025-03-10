-- Add migration script here
-- Add up migration script here
ALTER TABLE friend_wearable_requests ADD COLUMN is_successful BOOLEAN NOT NULL DEFAULT TRUE;