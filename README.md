# GTM Integration (gtm-mcp)

A remote **MCP server** that lets collaborators use an AI agent to read and change two Google Tag Manager containers (`web` + `server`). **GTM stays the source of truth**; every agent change is a reviewable, replayable **changeset**.

Design rationale lives in [`CONTEXT.md`](./CONTEXT.md) (glossary) and [`docs/adr/`](./docs/adr/) (decisions). Read those first.

## Architecture (one line)

```
Collaborator → MCP client → [Railway: this server + Postgres] → GTM API v2
```

- **Source of truth:** GTM. Pull → disposable mirror; Apply → GTM workspace. (ADR 0001)
- **Auth:** per-user Google OAuth, `edit`+`readonly` scopes only — never publish. (ADR 0003)
- **Changes:** imperative, single-container changesets; `Plan` groups across containers. (ADR 0004)
- **Workspaces:** ephemeral per changeset; free plan = 2 pending max → cap-guard. (ADR 0005)
- **Write safety:** two-phase `preview`→`apply`, fail-on-drift, before-image rollback. (ADR 0006)
- **Scope:** tags/triggers/variables/built-ins/folders + server clients/transformations + custom templates. (ADR 0007)

## Layout (DDD — dayuse-vibes)

```
src/
├── domain/          # entities, value objects, repository interfaces (no infra)
├── application/     # use cases (orchestration)
├── infrastructure/  # config, GTM adapter, Postgres impls
└── interfaces/      # MCP tools/server, HTTP entry
db/migrations/       # SQL schema
docs/adr/            # decisions
```

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values; see notes below (git-ignored)
npm run db:up                # start local Postgres (docker compose)
npm run db:migrate           # apply db/migrations/*.sql
npm run dev                  # boots on PORT, MCP at /mcp, OAuth at /oauth/login, health at /health
npm run verify               # lint:fix + format + typecheck + test
```

`.env.local` must have the Google OAuth client id/secret, the GTM account + container ids, and a 32-byte `TOKEN_ENCRYPTION_KEY`. The bundled `docker-compose.yml` matches the dummy `DATABASE_URL` (`postgres://u:p@localhost:5432/gtm`).

### Drive the daypass → dayaccess change end-to-end

1. `npm run db:up && npm run db:migrate && npm run dev`
2. **Log in:** open `http://localhost:3050/oauth/login` in a browser → Google consent → "Signed in as …". This stores your encrypted refresh token; the MCP dev session then acts as you (your own GTM rights).
3. **Connect a client:** `npx @modelcontextprotocol/inspector` → Transport **Streamable HTTP** → URL `http://localhost:3050/mcp` → Connect.
4. **Exercise (read-only is safe against live GTM):**
   - `whoami` → your email + per-container access.
   - `pull` `{ "container": "web" }` → refreshes the mirror (`.cache/gtm/`), returns entity counts.
   - `list_entities` / `get_entity` → find the `commercialType` variable + tags conditioned on `daypass`.
   - `preview` `{ "container": "web", "operations": [ … rename + recondition ops … ] }` → returns a `previewId`, a plain-language summary, and **dependency impacts** (every entity that references the renamed variable).
   - `apply` `{ "previewId": "…" }` → writes to a fresh ephemeral workspace and returns the changeset id. **Review + publish in the GTM UI** — the agent never publishes.

> `commercialType` may be a Constant, Lookup Table, or dataLayer variable — inspect it via `get_entity` first to decide value-change vs key-remap. If it lives in both containers, run the flow once per container (a Plan of two changesets).

**Auth in dev vs prod:** in development `requireAuth` is bypassed for `/mcp` and identity is resolved from the most recent `/oauth/login` (single-user dev). In production `requireAuth` still **fails closed (501)** — see below.

## ⚠️ Not deployable yet

`requireAuth` **fails closed in production** (returns 501) until Google OAuth federation (ADR 0003) is implemented. This is intentional — dayuse-vibes forbids deploying without authentication.

## RGPD note

We store collaborator **emails** (personal data) and encrypted OAuth tokens in Postgres. Railway is a US-operated host: choose an **EU region**, ensure a **DPA** is in place, and keep `TOKEN_ENCRYPTION_KEY` in Railway secrets. Tokens are AES-256-GCM encrypted at rest (ADR 0003).

## Infrastructure (Railway — Inno Labs workspace)

| Resource    | Name       | ID                                     |
| ----------- | ---------- | -------------------------------------- |
| Project     | GTM MCP    | `1dddef31-c38f-4331-a9bf-0c113e700782` |
| Environment | production | `c95f8edb-6816-47ea-9e76-4ca21e421f34` |
| Database    | Postgres   | `d282b6b7-7838-4d7b-ae76-c24716dc940d` |
| App service | gtm-mcp    | `50f079b2-107b-4126-8598-8dded1904f41` |

App service vars set: `NODE_ENV=production`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PENDING_CHANGESET_TTL_HOURS=72`.

**Still to set before deploy** (secrets + domain): `TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`, `GTM_ACCOUNT_ID/WEB_CONTAINER_ID/SERVER_CONTAINER_ID`, `GOOGLE_CHAT_WEBHOOK_URL`, `GITLAB_TOKEN` + `GITLAB_CATALOG_PROJECT_ID` (dataLayer catalog — ADR 0008; `GITLAB_TOKEN` is a Railway secret), `MCP_PUBLIC_URL` (after a public domain is generated). Set the Postgres + app service to an **EU region** (RGPD).

## Built (vertical slice)

- Google OAuth federation (`/oauth/login`, `/oauth/callback`) + AES-256-GCM token encryption at rest.
- `GtmClient` over `googleapis` (pull, examples, workspace count, workspace + entity writes).
- Postgres repositories (collaborator, oauth token, changeset, preview) + migration runner.
- Real tools: `whoami`, `pull`, `list_entities`, `get_entity`, `get_examples`, `export_container`, `search_container`, `workspace_status`, `list_changesets`, `get_changeset`, `preview`, `apply`, `reject`, `list_containers`, `list_datalayer_events`, `get_datalayer_event`, `get_datalayer_type`.
- `export_container` / `search_container` read the local mirror only (zero GTM API calls) — `export_container` dumps the whole container in one call (compact mode omits html/template blobs), `search_container` finds entities that carry a value (e.g. a condition `== daypass`), not just by name. Pull once, then query the mirror freely without touching GTM's tight quota.
- Two-phase `preview` → `apply`: validation, fail-on-drift (fingerprints), rename/template **dependency impacts**, cap-guard, ephemeral workspace, before-images. Never publishes.
- **dataLayer catalog** (ADR 0008): `list_datalayer_events` / `get_datalayer_event` / `get_datalayer_type` serve the authoritative upstream schema, fetched live from GitLab (API v4 + granular `read_repository` token), cached with a TTL + `.cache/datalayer/` disk fallback, returned as **compacted slices** (fat string-unions collapsed; referenced types kept as names / pulled on demand). Degrades gracefully when unconfigured or on a failed refresh; never blocks GTM work.

## Still stubbed / deferred

1. **Real MCP-transport OAuth** — dev resolves identity from the last `/oauth/login` (single-user). Production `/mcp` fails closed (501) until per-request transport auth is wired.
2. **`inverse`** tool (post-publish rollback helper) — returns a deferral pointer; use GTM "publish previous version" for now.
3. **Live apply** — exercised against live GTM (web workspace applied + verified via before-image diff). Cross-container (web + server) apply still being validated.
4. **Google Chat webhook + pending-changeset TTL job** (Q18).
5. **Changeset-status reconciliation** — the cap-guard and `workspace_status` now derive from the **live GTM workspace count** (`countWorkspaces`), so human publish/delete and UI-created workspaces no longer cause phantom slots, and the cap matches GTM's real 3-workspace limit. Still deferred: auto-marking a changeset `published` when its workspace is published in the UI (its DB status stays `applied`), and `reject` gracefully reconciling an already-gone workspace instead of erroring.
