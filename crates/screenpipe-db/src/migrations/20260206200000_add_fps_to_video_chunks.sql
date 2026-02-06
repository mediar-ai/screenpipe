-- Add fps column to video_chunks so the frontend can seek with video.currentTime = offset_index / fps
-- Default 0.5 matches the app default; CLI default is 1.0 but most users are on the app.
ALTER TABLE video_chunks ADD COLUMN fps REAL NOT NULL DEFAULT 0.5;
