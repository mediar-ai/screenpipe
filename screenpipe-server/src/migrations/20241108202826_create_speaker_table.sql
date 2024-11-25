-- Create speakers table
CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    metadata JSON
);

-- Create speaker embedding table
CREATE TABLE IF NOT EXISTS speaker_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding FLOAT[512] NOT NULL
    check(
      typeof(embedding) == 'blob'
      and vec_length(embedding) == 512
    ),
    speaker_id INTEGER REFERENCES speakers(id)
)
