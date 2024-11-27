-- First check if the column exists
SELECT CASE 
    WHEN COUNT(*) = 0 THEN
        'ALTER TABLE audio_transcriptions ADD COLUMN speaker_id INTEGER REFERENCES speakers(id);'
    ELSE
        'SELECT 1;'
END as sql_to_execute
FROM pragma_table_info('audio_transcriptions')
WHERE name = 'speaker_id';