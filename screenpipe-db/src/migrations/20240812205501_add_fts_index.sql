-- Add migration script here
-- Add FTS virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS chunked_text_index_fts USING fts5(text_id UNINDEXED, text);

-- Populate FTS table with existing data
INSERT INTO chunked_text_index_fts(text_id, text)
SELECT text_id, text FROM chunked_text_index;

-- Create a trigger to keep FTS table updated on INSERT
CREATE TRIGGER IF NOT EXISTS chunked_text_index_ai AFTER INSERT ON chunked_text_index BEGIN
  INSERT INTO chunked_text_index_fts(text_id, text) VALUES (new.text_id, new.text);
END;

-- Create a trigger to keep FTS table updated on DELETE
CREATE TRIGGER IF NOT EXISTS chunked_text_index_ad AFTER DELETE ON chunked_text_index BEGIN
  DELETE FROM chunked_text_index_fts WHERE text_id = old.text_id;
END;

-- Create a trigger to keep FTS table updated on UPDATE
CREATE TRIGGER IF NOT EXISTS chunked_text_index_au AFTER UPDATE ON chunked_text_index BEGIN
  DELETE FROM chunked_text_index_fts WHERE text_id = old.text_id;
  INSERT INTO chunked_text_index_fts(text_id, text) VALUES (new.text_id, new.text);
END;