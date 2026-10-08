---
name: gtm-mcp
description: Drive the GTM MCP server from this repo as the technical operator — read/modify Google Tag Manager (tags, triggers, variables, templates), run multi-step changes, consult the dataLayer catalog, and grow the living `docs/gtm` knowledge base. Use when the repo-resident developer is operating the GTM MCP tools directly (curl/JSON-RPC, multi-step changesets) or maintaining its docs. NOT for a non-technical teammate making a tracking change through the hosted assistant — that is the separate collaborator skill.
---

# GTM MCP

How to drive the GTM MCP server and grow the docs. Domain facts live in `docs/gtm/`, not here. For the end-to-end change workflow (including the browser checks before and after a write), follow the `gtm-change` skill.

## Connect

JSON-RPC 2.0 over Streamable HTTP at `http://localhost:3050/mcp` (production URL differs). You act as the logged-in user, with their own GTM rights.

```bash
# 1. initialize, capture the session id
SID=$(curl -sS -i -X POST http://localhost:3050/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"op","version":"0"}}}' \
  | grep -i '^mcp-session-id' | awk '{print $2}' | tr -d '\r')

# 2. call a tool (responses are SSE — strip the "data: " prefix)
curl -sS -X POST http://localhost:3050/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"TOOL","arguments":{}}}' \
  | sed -n 's/^data: //p'
```

Call `tools/list` first to see the tools and their input schemas.

Container aliases: `web` (prod web), `server` (prod sGTM), `preprod` (preprod web GTM-WMR4DMK, loaded by `*.dayuse-dev.com`; web-kind, its own changesets).

## Efficient workflow

GTM's API quota is tight (~3-5 calls/min). Work from the mirror, not the live API.

1. **`pull` the container ONCE** — refreshes the local mirror from the **live (published) version**, not the Default Workspace. The only read that costs GTM quota; `get_entity` / `list_entities` read the mirror too. Quota errors are retried server-side with backoff (up to ~2 min).
2. **Understand + locate from the mirror (ZERO quota):**
   - `export_container` — the whole container in one call (default compact).
   - `search_container` — every entity carrying a value/string, not just by name.
   - DO NOT loop `get_entity` to scan a container — that hammers the quota and fails. Use export/search.
3. **Consult the dataLayer catalog — only when it earns its tokens.** Reach for it ONLY to confirm what is _real_ before authoring or validating a dataLayer-conditioned entity: an event name, a property path (e.g. `ecommerce.items.0.dayuse_additional_data.offer.commercialType`), or an allowed value (e.g. `dayuse` / `dayaccess`). Skip it for edits that don't touch dataLayer keys.
   - `list_datalayer_events` — the cheap index (event names). **Call this FIRST.**
   - `get_datalayer_event {name, mode}` — one event's shape; `compact` (default) collapses fat string-unions, `full` expands referenced types one level.
   - `get_datalayer_type {name}` — drill one referenced type on demand.
   - Always `list` → drill. NEVER try to read the whole catalog; it is large by design.
4. **Two-phase write:**
   - `preview` — validate + return impacts. READ the impacts before applying.
   - `apply` — writes to a fresh workspace for human review. Check `workspace_status` first (per-container pending cap).
5. **Publish** with `publish {changesetId}` only after the change is observed in GTM Preview (`gtm-change` step 5). Admin-only; it refuses on drift, conflict or compiler error. Role limits (ADR 0011): collaborators cannot change custom templates, clients or transformations, and act only on their own changesets.
6. **Change client + server together.** A tracking change usually spans both containers (web emits/forwards a value; sGTM consumes it / sends onward). Author the web changeset AND its server counterpart in the same pass and `preview` both, so the full `dataLayer → sGTM → tag` flow exists at once and is testable **end-to-end in one GTM Preview session**. Never ship a client-only or server-only half-state — it can't be validated and risks a live gap. (Still one changeset/workspace per container — pair them, preview both, publish both.)
7. **Reuse a signal's established name across containers** — forward/read it under its existing client-side name (e.g. `didConsentToFacebook`), don't coin a server-side synonym. See `docs/gtm/conventions.md`.

## Source of truth + documentation loop

Read `docs/gtm/README.md` first — it is the **source-of-truth map** (which tier owns what, and what is mutable). In short:

- **dataLayer catalog** = the authoritative, upstream-generated schema (what the site _can_ emit). Read-only, served by the MCP catalog tools above — **never vendor or amend it** ("do not edit by hand").
- **`docs/gtm/dataLayer.md`** = **bindings**: which GTM entity references which catalog event/property, verified in-container. You amend this. Bindings are also re-derivable live from GTM via `search_container` / `export_container`.
- `docs/gtm/` is living documentation — each run leaves it better than it found it.

- **BEFORE acting:** read `docs/gtm/` to orient (the map, containers, conventions, bindings). Fewer doc gaps → fewer discovery calls next time.
- **AFTER verifying a catalog↔GTM wiring:** record it in `dataLayer.md` (the binding + where observed), and add container/naming facts to their files. Keep entries factual and concise; don't duplicate existing rows. Amend the docs — **never** the catalog.
