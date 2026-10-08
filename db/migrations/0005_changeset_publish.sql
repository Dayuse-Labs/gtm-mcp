-- Publish tool (ADR 0011): the container version cut from a changeset's workspace.
-- Additive + nullable: safe on an existing changeset table.
ALTER TABLE changeset ADD COLUMN IF NOT EXISTS gtm_version_id TEXT;
ALTER TABLE changeset ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
