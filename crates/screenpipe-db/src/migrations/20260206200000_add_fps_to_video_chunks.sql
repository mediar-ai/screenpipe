-- Add fps column to video_chunks so the frontend can seek with video.currentTime = offset_index / fps
-- NULL for pre-existing chunks: frontend detects NULL and auto-calibrates from video duration
ALTER TABLE video_chunks ADD COLUMN fps REAL;
