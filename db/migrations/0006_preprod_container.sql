-- Preprod web container alias (ADR 0012). Widens the alias CHECKs; Postgres named the
-- inline column CHECKs <table>_<column>_check in 0001/0002.
ALTER TABLE changeset DROP CONSTRAINT IF EXISTS changeset_container_alias_check;
ALTER TABLE changeset ADD CONSTRAINT changeset_container_alias_check
  CHECK (container_alias IN ('web', 'server', 'preprod'));

ALTER TABLE preview DROP CONSTRAINT IF EXISTS preview_container_check;
ALTER TABLE preview ADD CONSTRAINT preview_container_check
  CHECK (container IN ('web', 'server', 'preprod'));
