-- Add centroid column to speakers table for running average embedding
-- NULL for existing speakers — will populate as new audio comes in
-- Also add embedding_count to track how many samples contributed to centroid
ALTER TABLE speakers ADD COLUMN centroid FLOAT[512];
ALTER TABLE speakers ADD COLUMN embedding_count INTEGER DEFAULT 0;
