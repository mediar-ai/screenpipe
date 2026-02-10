-- Fix orphaned audio_transcriptions pointing to deleted speakers.
-- These were left behind by the old reassign_speaker propagation bug
-- which deleted speakers without properly moving all their transcriptions.
-- 
-- Set speaker_id to NULL so these transcriptions are "unassigned" rather than
-- pointing to non-existent speakers. They remain searchable via general audio
-- search and can be manually reassigned to the correct speaker.
UPDATE audio_transcriptions
SET speaker_id = NULL
WHERE speaker_id IS NOT NULL
  AND speaker_id NOT IN (SELECT id FROM speakers);
