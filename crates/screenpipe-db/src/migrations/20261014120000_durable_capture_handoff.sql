-- screenpipe — AI that knows everything you've seen, said, or heard
-- https://screenpipe.com

-- Capture handoff metadata stays resident in hybrid storage. Receipts deliberately
-- have no frames foreign key: deletion must not make an acknowledged capture replayable.
CREATE TABLE IF NOT EXISTS _capture_journal_source (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    source_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS _capture_journal_receipts (
    capture_id TEXT PRIMARY KEY,
    frame_id INTEGER
);
CREATE TABLE IF NOT EXISTS _capture_journal_exclusions (
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    projection INTEGER NOT NULL,
    PRIMARY KEY (started_at, ended_at, projection)
);
CREATE INDEX IF NOT EXISTS _capture_journal_exclusions_by_end
    ON _capture_journal_exclusions(ended_at, started_at, projection);
