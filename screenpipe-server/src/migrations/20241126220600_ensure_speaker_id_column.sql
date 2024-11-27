-- Check if the column exists and add it if it doesn't
SELECT CASE 
    WHEN NOT EXISTS (
        SELECT 1 
        FROM pragma_table_info('audio_transcriptions') 
        WHERE name = 'speaker_id'
    ) 
    THEN 
        'ALTER TABLE audio_transcriptions ADD COLUMN speaker_id INTEGER REFERENCES speakers(id);'
    ELSE 
        'SELECT 1;'
END as migration_sql;

-- Execute the generated SQL
WITH migration AS (
    SELECT CASE 
        WHEN NOT EXISTS (
            SELECT 1 
            FROM pragma_table_info('audio_transcriptions') 
            WHERE name = 'speaker_id'
        ) 
        THEN 
            'ALTER TABLE audio_transcriptions ADD COLUMN speaker_id INTEGER REFERENCES speakers(id);'
        ELSE 
            'SELECT 1;'
    END as sql_to_execute
)
SELECT sql_to_execute FROM migration;
