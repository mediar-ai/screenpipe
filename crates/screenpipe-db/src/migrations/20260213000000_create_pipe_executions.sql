-- Pipe execution history (one row per run)
CREATE TABLE IF NOT EXISTS pipe_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipe_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    trigger_type TEXT NOT NULL DEFAULT 'manual',
    pid INTEGER,
    model TEXT,
    provider TEXT,
    started_at TEXT,
    finished_at TEXT,
    stdout TEXT DEFAULT '',
    stderr TEXT DEFAULT '',
    exit_code INTEGER,
    error_type TEXT,
    error_message TEXT,
    duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pipe_exec_name_status ON pipe_executions(pipe_name, status);
CREATE INDEX IF NOT EXISTS idx_pipe_exec_running ON pipe_executions(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_pipe_exec_name_time ON pipe_executions(pipe_name, id DESC);

-- Scheduler state (one row per pipe, survives restarts)
CREATE TABLE IF NOT EXISTS pipe_scheduler_state (
    pipe_name TEXT PRIMARY KEY,
    last_run_at TEXT,
    last_success_at TEXT,
    consecutive_failures INTEGER DEFAULT 0
);
