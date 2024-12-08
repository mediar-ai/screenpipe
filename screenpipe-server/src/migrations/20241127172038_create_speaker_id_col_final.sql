CREATE TABLE IF NOT EXISTS audio_transcriptions_new AS 
SELECT *, NULL as speaker_id 
FROM audio_transcriptions 
WHERE 0;

INSERT INTO audio_transcriptions_new 
SELECT *, NULL as speaker_id 
FROM audio_transcriptions;

DROP TABLE audio_transcriptions;
ALTER TABLE audio_transcriptions_new RENAME TO audio_transcriptions;