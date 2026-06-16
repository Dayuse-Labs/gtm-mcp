-- GTM Integration — initial schema (ADR 0002, 0003, 0004, 0006)
-- Parameterized queries only at the app layer; no string concatenation (dayuse-vibes red line).

-- Collaborators: identity + role. Email is personal data → RGPD applies (see README).
CREATE TABLE IF NOT EXISTS collaborator (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub    TEXT NOT NULL UNIQUE,           -- stable Google user id
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL DEFAULT 'collaborator'
                  CHECK (role IN ('collaborator', 'admin')),  -- ADR 0015 / Q15; granted via direct DB access
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ
);

-- Per-user Google OAuth refresh tokens, ENCRYPTED at rest (AES-256-GCM, ADR 0003).
-- Never store plaintext tokens.
CREATE TABLE IF NOT EXISTS oauth_token (
  collaborator_id  UUID PRIMARY KEY REFERENCES collaborator(id) ON DELETE CASCADE,
  ciphertext       BYTEA NOT NULL,   -- AES-GCM ciphertext of the refresh token
  iv               BYTEA NOT NULL,   -- 12-byte nonce
  auth_tag         BYTEA NOT NULL,   -- GCM auth tag
  scopes           TEXT NOT NULL,    -- granted scopes (expect edit.containers + readonly, NO publish)
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Changesets: imperative, single-container unit of review/audit/rollback (ADR 0004).
CREATE TABLE IF NOT EXISTS changeset (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID NOT NULL REFERENCES collaborator(id),
  container_alias TEXT NOT NULL CHECK (container_alias IN ('web', 'server')),
  plan_id         UUID,                          -- optional cross-container Plan grouping (no atomicity)
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'previewed', 'applied', 'rejected', 'published')),
  operations      JSONB NOT NULL,                -- ordered Operation[] (validated by Zod at the app layer)
  before_images   JSONB,                         -- captured at Apply for rollback/audit (ADR 0006)
  gtm_workspace_id TEXT,                          -- ephemeral workspace created at Apply (ADR 0005)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_changeset_status ON changeset (container_alias, status);

-- Immutable audit trail of every state-changing action (dayuse-vibes: audit logging).
CREATE TABLE IF NOT EXISTS audit_event (
  id              BIGSERIAL PRIMARY KEY,
  collaborator_id UUID REFERENCES collaborator(id),
  changeset_id    UUID REFERENCES changeset(id),
  action          TEXT NOT NULL,                 -- preview | apply | reject | inverse | pull | ...
  detail          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
