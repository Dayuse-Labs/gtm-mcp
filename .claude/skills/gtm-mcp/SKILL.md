---
name: gtm-mcp
description: Operate the GTM MCP server to read and change Google Tag Manager containers (tags, triggers, variables, templates) efficiently, and keep the living GTM docs current. Use when reading or modifying GTM through the agent — changing tags/triggers/variables, renaming entities, updating firing conditions, or inspecting a container.
---

# GTM MCP

How to drive the GTM MCP server and grow the docs. Domain facts live in `docs/gtm/`, not here.

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

## Efficient workflow

GTM's API quota is tight (~3-5 calls/min). Work from the mirror, not the live API.

1. **`pull` the container ONCE** — refreshes the local mirror. The only step that costs GTM quota.
2. **Understand + locate from the mirror (ZERO quota):**
   - `export_container` — the whole container in one call (default compact).
   - `search_container` — every entity carrying a value/string, not just by name.
   - DO NOT loop `get_entity` to scan a container — that hammers the quota and fails. Use export/search.
3. **Two-phase write:**
   - `preview` — validate + return impacts. READ the impacts before applying.
   - `apply` — writes to a fresh workspace for human review. Check `workspace_status` first (per-container pending cap).
4. **Never publish** — you can't, by design. The human reviews + publishes in the GTM UI.

## Incremental documentation loop

`docs/gtm/` is living documentation — each run leaves it better than it found it.

- **BEFORE acting:** read `docs/gtm/` to orient (containers, conventions, dataLayer events/properties). Fewer doc gaps → fewer discovery calls next time.
- **AFTER acting/discovering:** amend `docs/gtm/` with what you verified — especially **dataLayer events and properties** (the dynamic part), plus container and naming facts. Keep entries factual and concise; don't duplicate existing rows.
