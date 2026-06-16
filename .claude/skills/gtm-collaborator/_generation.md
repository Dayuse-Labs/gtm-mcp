# How this skill is generated (anti-drift record — ADR 0009)

**This bundle is a GENERATED PROJECTION of `docs/gtm`, not independently authored.** `docs/gtm` is the single source of truth; this skill is a curated, friendlier view of it for a non-technical Collaborator who has no repo access. When the source changes materially, regenerate this bundle — never hand-edit it to diverge from the source.

## Source mapping (SKILL.md section ⇐ canonical source)

| SKILL.md section                   | Projected from                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| How it works (workflow)            | `README.md` + `CONTEXT.md` (Pull / Preview / Apply / Publish) · ADR 0006 (two-phase apply) · ADR 0003 (never publishes)                                                                          |
| The rules that keep you safe       | `docs/gtm/conventions.md` → "Editing notes" (full-body replace, name-only summary, search-for-buried-text) · ADR 0006 (fail-on-drift) · ADR 0005 (3-workspace cap) · ADR 0003 (no publish scope) |
| Checking real event names & values | ADR 0008 (catalog via MCP tools) — tools only                                                                                                                                                    |
| How we name things (primer)        | `docs/gtm/conventions.md` → "Entity naming", "Commercial type", "Trigger filter shape"                                                                                                           |
| Outdated-skill handshake           | ADR 0009 (version handshake)                                                                                                                                                                     |

## Rebuild step

When `docs/gtm/conventions.md`, the workflow, or the guardrails change materially:

1. Re-project the **"How we name things"** primer from `docs/gtm/conventions.md` (keep it minimal — essentials only).
2. Re-check the **guardrails** section against `conventions.md` "Editing notes" + ADRs 0003/0005/0006.
3. **Bump `skillVersion`** in `SKILL.md` frontmatter (semver).
4. Re-publish via the **org-managed channel** (Team/Enterprise admin-provisioned, or Claude Code managed settings).
5. If the change is **mandatory** (old skill is now unsafe), raise the server's `minSkillVersion` so outdated bundles self-warn via the `whoami` handshake.

## Never bundle (would re-split the source of truth)

- **The dataLayer catalog** — served live over MCP (`list_datalayer_events` / `get_datalayer_event` / `get_datalayer_type`, ADR 0008). It changes often; bundling it would go stale. The skill references the tools only.
- **The dataLayer bindings** (`docs/gtm/dataLayer.md`) — re-derived live from GTM via `search_container` / `export_container`. GTM is the source of truth for state; never freeze bindings into the bundle.
