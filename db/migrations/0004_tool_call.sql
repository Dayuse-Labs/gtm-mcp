-- Per-call observability log (ADR 0010). Distinct from audit_event (state-change
-- audit trail, ADR 0004): this is best-effort, covers EVERY MCP tool call (reads
-- included), and answers "usage per collaborator" + "is everything going right".
-- Sanitized arg summary only — never raw operation bodies or query text (RGPD: data minimisation).
CREATE TABLE IF NOT EXISTS tool_call (
  id              BIGSERIAL PRIMARY KEY,
  -- SET NULL (not CASCADE): health/error history survives a collaborator leaving, de-attributed.
  collaborator_id UUID REFERENCES collaborator(id) ON DELETE SET NULL,
  session_id      TEXT,                              -- mcp-session-id; groups one working session
  tool            TEXT NOT NULL,                     -- the MCP tool name
  container        TEXT,                             -- 'web' | 'server' when the call targets one
  outcome         TEXT NOT NULL CHECK (outcome IN ('ok', 'error')),
  error_message   TEXT,                              -- capped failure message when outcome = error
  duration_ms     INTEGER NOT NULL,
  arg_summary     JSONB,                             -- shape hints only (opsCount, queryLength, …)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now() -- stamped in-app at call completion
);

-- usage-per-collaborator rollups; also the leading edge for "recent activity" reads.
CREATE INDEX IF NOT EXISTS idx_tool_call_collaborator ON tool_call (collaborator_id, created_at DESC);
-- health: error-rate / per-tool slicing.
CREATE INDEX IF NOT EXISTS idx_tool_call_tool ON tool_call (tool, outcome);
-- retention purge scans created_at (rides the pending-changeset TTL job — TOOL_CALL_RETENTION_DAYS).
CREATE INDEX IF NOT EXISTS idx_tool_call_created ON tool_call (created_at);
