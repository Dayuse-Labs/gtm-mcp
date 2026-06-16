-- Store the plain-language, field-level change summary on the changeset (ADR 0006),
-- so get_changeset shows the real edits (condition values, event labels), not just renames.
-- Additive + defaulted: safe to apply to an existing changeset table.
ALTER TABLE changeset ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '[]'::jsonb;
