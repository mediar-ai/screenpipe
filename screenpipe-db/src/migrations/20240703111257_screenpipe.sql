
-- Create video_chunks table
CREATE TABLE IF NOT EXISTS video_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL
);

-- Create frames table
CREATE TABLE IF NOT EXISTS frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_chunk_id INTEGER NOT NULL,
    offset_index INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    FOREIGN KEY (video_chunk_id) REFERENCES video_chunks(id)
);

-- Create ocr_text table
CREATE TABLE IF NOT EXISTS ocr_text (
    frame_id INTEGER NOT NULL,
    text TEXT NOT NULL
);

-- Create audio_chunks table
CREATE TABLE IF NOT EXISTS audio_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL
);

-- Create audio_transcriptions table
CREATE TABLE IF NOT EXISTS audio_transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audio_chunk_id INTEGER NOT NULL,
    offset_index INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    transcription TEXT NOT NULL,
    FOREIGN KEY (audio_chunk_id) REFERENCES audio_chunks(id)
);

-- Create indices (you may want to add specific indices based on your query patterns)
CREATE INDEX IF NOT EXISTS idx_frames_video_chunk_id ON frames(video_chunk_id);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_audio_chunk_id ON audio_transcriptions(audio_chunk_id);
CREATE INDEX IF NOT EXISTS idx_ocr_text_frame_id ON ocr_text(frame_id);

