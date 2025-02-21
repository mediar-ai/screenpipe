-- Add new columns to friend_wearable_requests table
ALTER TABLE friend_wearable_requests ADD COLUMN filtered_text TEXT;
ALTER TABLE friend_wearable_requests ADD COLUMN structured_response TEXT;
ALTER TABLE friend_wearable_requests ADD COLUMN response_id TEXT;
ALTER TABLE friend_wearable_requests ADD COLUMN response_created_at DATETIME;