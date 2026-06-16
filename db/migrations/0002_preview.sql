-- Previews: short-lived phase-1 artifacts of a two-phase Apply (ADR 0006).
CREATE TABLE IF NOT EXISTS preview (
  id            UUID PRIMARY KEY,
  author_id     UUID NOT NULL REFERENCES collaborator(id),
  container     TEXT NOT NULL CHECK (container IN ('web', 'server')),
  operations    JSONB NOT NULL,
  summary       JSONB NOT NULL,   -- string[]
  impacts       JSONB NOT NULL,   -- ImpactEntry[]
  baseline      JSONB NOT NULL,   -- BaselineEntry[] (fingerprints for drift re-check)
  created_at    TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_preview_expiry ON preview (expires_at);
