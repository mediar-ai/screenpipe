-- Add migration script here
ALTER TABLE frames ADD COLUMN name TEXT;
CREATE VIRTUAL TABLE frames_fts USING fts5(name, content='frames', content_rowid='id');
-- Trigger to keep the FTS index up to date
CREATE TRIGGER frames_ai AFTER INSERT ON frames BEGIN
  INSERT INTO frames_fts(rowid, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER frames_ad AFTER DELETE ON frames BEGIN
  INSERT INTO frames_fts(frames_fts, rowid, name) VALUES('delete', old.id, old.name);
END;
CREATE TRIGGER frames_au AFTER UPDATE ON frames BEGIN
  INSERT INTO frames_fts(frames_fts, rowid, name) VALUES('delete', old.id, old.name);
  INSERT INTO frames_fts(rowid, name) VALUES (new.id, new.name);
END;

