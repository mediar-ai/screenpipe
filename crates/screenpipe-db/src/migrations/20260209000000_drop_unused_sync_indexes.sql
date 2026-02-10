-- Drop unused cloud sync indexes.
-- These indexes exist on sync_id/synced_at/machine_id columns that are always NULL
-- (cloud sync was never enabled). Each index adds ~0.3-0.5ms per INSERT for B-tree
-- maintenance, penalizing every frame, OCR, and audio write.
-- Indexes can be recreated lazily if cloud sync is ever shipped.

DROP INDEX IF EXISTS idx_frames_sync_id;
DROP INDEX IF EXISTS idx_frames_synced_at;
DROP INDEX IF EXISTS idx_frames_machine_id;

DROP INDEX IF EXISTS idx_ocr_text_sync_id;
DROP INDEX IF EXISTS idx_ocr_text_synced_at;

DROP INDEX IF EXISTS idx_audio_chunks_sync_id;
DROP INDEX IF EXISTS idx_audio_chunks_synced_at;

DROP INDEX IF EXISTS idx_audio_transcriptions_sync_id;
DROP INDEX IF EXISTS idx_audio_transcriptions_synced_at;

DROP INDEX IF EXISTS idx_frames_unsynced;
DROP INDEX IF EXISTS idx_audio_transcriptions_unsynced;
