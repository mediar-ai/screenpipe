ALTER TABLE audio_transcriptions 
ADD COLUMN speaker_id INTEGER REFERENCES speakers(id);