-- Create speakers table
CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding FLOAT[512] NOT NULL
    check(
      typeof(embedding) == 'blob'
      and vec_length(embedding) == 512
    ),
    name TEXT,
    metadata JSON
);
