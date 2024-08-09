-- Add migration script here
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunked_text_index_text ON chunked_text_index(text);
