# Preprod web container as a third alias

The server addresses a third container, alias **`preprod`**: the web container GTM-WMR4DMK ("New Front (dev env)", id 41658217, same account) that `*.dayuse-dev.com` loads. It is web-kind (no clients/transformations) and supports every tool `web` does.

## Why

- Purchase and checkout changes must be verified on preprod before prod (`.claude/skills/gtm-change/preprod-purchases.md`), and preprod runs its own container, not GTM-PFRJSLZ. Reading and changing it outside the server bypassed preview, drift checks and the changeset record.
- Preprod is a separate container that drifts from prod (its own tag ids, its own history), not a GTM environment of `web`. A change meant for both is a **Plan of two changesets**, one per container (ADR 0004).

## Consequences

- `GTM_PREPROD_CONTAINER_ID` is optional: when unset, any call targeting `preprod` fails with "not configured" and `whoami` reports it as such, so existing deployments keep working.
- The free-plan workspace cap (ADR 0005) applies to preprod separately: 3 workspaces incl. Default.
- Preprod sends to the **prod** sGTM and the prod Meta pixel, so a preprod change can still reach production destinations.
- Migration `0006_preprod_container.sql` widens the `changeset` and `preview` alias CHECKs.
