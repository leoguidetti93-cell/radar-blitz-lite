CREATE TABLE IF NOT EXISTS double_rounds (id TEXT PRIMARY KEY, number INTEGER NOT NULL, instant TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_double_rounds_instant ON double_rounds(instant DESC);
