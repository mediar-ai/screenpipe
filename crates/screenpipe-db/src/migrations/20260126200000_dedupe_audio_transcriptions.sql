-- Migration: Deduplicate audio transcriptions and add UNIQUE constraint
-- This prevents the same transcription text from being inserted multiple times
-- for the same audio chunk (caused by VAD segment overlap issues)
--
-- Safe for production: handles FTS triggers correctly

PRAGMA foreign_keys = OFF;

-- Step 1: Create a table with IDs to delete (keeping the row with lowest id for each duplicate group)
CREATE TABLE IF NOT EXISTS _temp_audio_ids_to_delete AS
SELECT id FROM audio_transcriptions
WHERE id NOT IN (
    SELECT MIN(id)
    FROM audio_transcriptions
    GROUP BY audio_chunk_id, transcription
);

-- Step 2: Delete from FTS table first to avoid trigger conflicts
-- The FTS table uses audio_chunk_id as the key
DELETE FROM audio_transcriptions_fts
WHERE audio_chunk_id IN (
    SELECT audio_chunk_id FROM audio_transcriptions
    WHERE id IN (SELECT id FROM _temp_audio_ids_to_delete)
);

-- Step 3: Temporarily drop the delete trigger to avoid FTS issues
DROP TRIGGER IF EXISTS audio_transcriptions_delete;

-- Step 4: Delete the duplicate rows from the main table
DELETE FROM audio_transcriptions WHERE id IN (SELECT id FROM _temp_audio_ids_to_delete);

-- Step 5: Recreate the delete trigger
CREATE TRIGGER IF NOT EXISTS audio_transcriptions_delete AFTER DELETE ON audio_transcriptions
BEGIN
    DELETE FROM audio_transcriptions_fts
    WHERE audio_chunk_id = OLD.audio_chunk_id;
END;

-- Step 6: Clean up the temporary table
DROP TABLE IF EXISTS _temp_audio_ids_to_delete;

-- Step 7: Add the UNIQUE constraint to prevent future duplicates
-- This index ensures (audio_chunk_id, transcription) is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_audio_transcription_chunk_text
ON audio_transcriptions(audio_chunk_id, transcription);

PRAGMA foreign_keys = ON;
