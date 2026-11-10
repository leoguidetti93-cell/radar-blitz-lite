-- EXECUTAR UMA VEZ NO D1 EXISTENTE, ANTES DE PUBLICAR O WORKER.
CREATE TABLE IF NOT EXISTS suggestions (
 id TEXT PRIMARY KEY NOT NULL,
 target_instant TEXT NOT NULL,
 color TEXT NOT NULL CHECK(color IN ('yellow','black')),
 status TEXT NOT NULL CHECK(status IN ('pending','active','done')),
 outcome TEXT,
 created_at TEXT NOT NULL,
 resolved_at TEXT,
 model_version TEXT NOT NULL,
 sample_train INTEGER NOT NULL,
 sample_test INTEGER NOT NULL,
 validation_rate REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_target ON suggestions(target_instant DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status,target_instant DESC);
