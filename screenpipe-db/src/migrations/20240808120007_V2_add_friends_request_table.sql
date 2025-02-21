CREATE TABLE friend_wearable_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    memory_source TEXT NOT NULL,
    chunk_id_range TEXT NOT NULL,
    timestamp_range TEXT NOT NULL,
    friend_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_friend_wearable_requests_memory_source ON friend_wearable_requests(memory_source);
CREATE INDEX idx_friend_wearable_requests_friend_user_id ON friend_wearable_requests(friend_user_id);