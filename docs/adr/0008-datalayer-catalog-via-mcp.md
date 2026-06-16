# dataLayer catalog is served via MCP, fetched live from GitLab

The agent needs our authoritative dataLayer event catalog (the front-end's generated `datalayer-events.ts` in the GitLab `ab-tests` repo — ~50 events, ~15k tokens, changing often) to author correct GTM triggers/variables. We expose it as **MCP tools** (`list_datalayer_events`, `get_datalayer_event`, `get_datalayer_type`, optionally `search_datalayer`) backed by a server-side adapter that **fetches the file live from the GitLab API**, caches it, and returns **compacted slices** — never the whole file.

## Considered Options

- **Vendored copy in this repo** — rejected: invisible to the remote, non-technical Collaborator (the repo never reaches them), and goes stale.
- **Bundled in the collaborator skill** — rejected: the catalog changes often, but a bundle only refreshes on a skill re-release.
- **Agent fetches GitLab on demand** — rejected: the web raw URL is behind Cloudflare (403) and the repo is private; a headless agent cannot pull it.
- **MCP tools, server-fetched + cached (chosen)** — reaches both personas, enforces the token budget in code, custodies the GitLab token server-side, and self-refreshes.

## Consequences

- A GTM-API server (scoped to GTM by ADR 0007) now reaches into the **front-end** GitLab repo for a generated file — a deliberate boundary crossing. The catalog is a **disposable derived read-cache**, like the Mirror (ADR 0001): never the source of truth, never git-tracked.
- New secret + config: `GITLAB_TOKEN` (granular, scope `read_repository`) + `GITLAB_CATALOG_PROJECT_ID`; `ref`/`path`/TTL stay code constants. Reached via `/api/v4/projects/<id>/repository/files/<path>/raw` — the API host bypasses the Cloudflare wall that blocks the web `/-/raw/` URL.
- The granular token can expire and upstream can move the file → tools **degrade gracefully**: serve the last-good `.cache/datalayer/` copy + a staleness warning, never hard-block GTM work.
- Responses are **compacted**: fat string-literal unions (the page×domain `item_list_name`, the ~300-entry `KameleoonGoalName`) are collapsed; referenced types stay as bare names and expand only on request (`mode:full` or `get_datalayer_type`). Discriminants (`event`, `eventTarget`, `eventOrigin`) are always kept verbatim — they are what GTM triggers match on.
