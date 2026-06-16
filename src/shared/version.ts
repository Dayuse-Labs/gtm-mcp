/**
 * Collaborator-skill version handshake (ADR 0009).
 *
 * The hosted collaborator skill carries a `skillVersion` and, on connect, reads
 * the server's `minSkillVersion` (returned by `whoami`) to self-warn when it is
 * outdated. The minimum is server config: a code default that an admin can raise
 * at deploy time via the `MIN_SKILL_VERSION` env var (no code change) — e.g. to
 * force already-distributed stale bundles to warn.
 */
export const DEFAULT_MIN_SKILL_VERSION = '1.0.0';

/** Effective minimum skill version: the env override wins over the default. */
export function resolveMinSkillVersion(override: string | undefined): string {
  return override ?? DEFAULT_MIN_SKILL_VERSION;
}
