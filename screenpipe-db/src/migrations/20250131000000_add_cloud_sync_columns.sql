-- Cloud sync columns for multi-machine sync
-- sync_id: UUID for deduplication across machines
-- machine_id: identifies which computer the record came from
-- synced_at: when this record was uploaded to cloud (NULL = not synced yet)

-- Add sync columns to frames
ALTER TABLE frames ADD COLUMN sync_id TEXT;
ALTER TABLE frames ADD COLUMN machine_id TEXT;
ALTER TABLE frames ADD COLUMN synced_at DATETIME;

-- Add sync columns to ocr_text
ALTER TABLE ocr_text ADD COLUMN sync_id TEXT;
ALTER TABLE ocr_text ADD COLUMN synced_at DATETIME;

-- Add sync columns to audio_chunks
ALTER TABLE audio_chunks ADD COLUMN sync_id TEXT;
ALTER TABLE audio_chunks ADD COLUMN machine_id TEXT;
ALTER TABLE audio_chunks ADD COLUMN synced_at DATETIME;

-- Add sync columns to audio_transcriptions
ALTER TABLE audio_transcriptions ADD COLUMN sync_id TEXT;
ALTER TABLE audio_transcriptions ADD COLUMN synced_at DATETIME;

-- Add sync columns to video_chunks
ALTER TABLE video_chunks ADD COLUMN sync_id TEXT;
ALTER TABLE video_chunks ADD COLUMN machine_id TEXT;
ALTER TABLE video_chunks ADD COLUMN synced_at DATETIME;

-- Indexes for efficient sync queries
CREATE INDEX IF NOT EXISTS idx_frames_sync_id ON frames(sync_id);
CREATE INDEX IF NOT EXISTS idx_frames_synced_at ON frames(synced_at);
CREATE INDEX IF NOT EXISTS idx_frames_machine_id ON frames(machine_id);

CREATE INDEX IF NOT EXISTS idx_ocr_text_sync_id ON ocr_text(sync_id);
CREATE INDEX IF NOT EXISTS idx_ocr_text_synced_at ON ocr_text(synced_at);

CREATE INDEX IF NOT EXISTS idx_audio_chunks_sync_id ON audio_chunks(sync_id);
CREATE INDEX IF NOT EXISTS idx_audio_chunks_synced_at ON audio_chunks(synced_at);

CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_sync_id ON audio_transcriptions(sync_id);
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_synced_at ON audio_transcriptions(synced_at);

-- Index for finding unsynced records
CREATE INDEX IF NOT EXISTS idx_frames_unsynced ON frames(synced_at) WHERE synced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audio_transcriptions_unsynced ON audio_transcriptions(synced_at) WHERE synced_at IS NULL;
