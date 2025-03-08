-- Create tags table
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create junction table for vision (frames) and tags
CREATE TABLE vision_tags (
    vision_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (vision_id, tag_id),
    FOREIGN KEY (vision_id) REFERENCES frames(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Create junction table for audio and tags
CREATE TABLE audio_tags (
    audio_chunk_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (audio_chunk_id, tag_id),
    FOREIGN KEY (audio_chunk_id) REFERENCES audio_chunks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Create indexes for faster querying
CREATE INDEX idx_vision_tags_vision_id ON vision_tags(vision_id);
CREATE INDEX idx_vision_tags_tag_id ON vision_tags(tag_id);
CREATE INDEX idx_audio_tags_audio_chunk_id ON audio_tags(audio_chunk_id);
CREATE INDEX idx_audio_tags_tag_id ON audio_tags(tag_id);