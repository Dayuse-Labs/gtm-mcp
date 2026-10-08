---
name: gtm-change
description: Workflow for any change or debug of Google Tag Manager tracking (tags, triggers, variables, pixels, sGTM)
---

# GTM change

Two tools, two jobs. The **MCP** is how you read and write GTM configuration: cheap, exhaustive, auditable. The **browser** is how you learn what actually runs: configuration says what _should_ fire, only a runtime capture says what _did_. A change is done when it is **observed** in a runtime capture, not when it is applied.

MCP mechanics (connecting, quota, catalog drill order, operation shapes) live in the `gtm-mcp` skill; browser techniques in [runtime-checks.md](runtime-checks.md).

## Steps

1. **Orient.** Read `docs/gtm/`, then `pull` each container once.
   Done when: both mirrors are fresh and you know which container(s) the change touches.

2. **Map the configuration (MCP).** With `search_container` / `export_container`, find every entity on the path: the tag that sends, its trigger conditions, every variable feeding a parameter (follow `{{…}}` chains to the dataLayer key or code), and any server-side counterpart. Read custom JS and template code line by line where values pass through it. Confirm each dataLayer key exists **on the event that fires the trigger** in the catalog (`list_datalayer_events` → `get_datalayer_event`).
   Done when: every link from dataLayer push to outgoing request is named by entity id, and each key is confirmed on its triggering event.

3. **Observe today's behaviour (browser).** Reproduce the user journey on the live site and capture what is actually sent now.
   Done when: you hold the real outgoing call (or proof it never fires) for the case the change targets. The finding often changes the plan: a tag that never fires, a value injected outside GTM.

4. **Write (MCP).** `preview` → read the summary and impacts → `apply`. Pair web and server changesets when the flow spans both; one changeset per container.
   Done when: every changeset is applied and you have its workspace id.

5. **Verify the workspace (browser).** Open GTM Preview on the new workspace(s), replay the step 3 journey, capture the outgoing call.
   Done when: the capture shows the expected payload. Purchase and checkout changes are verified on preprod per [preprod-purchases.md](preprod-purchases.md). If the journey cannot be replayed (an app flow), the change is **unverified**: say so, and list the exact check a human must run.

6. **Hand over.** Report each change with before → after, workspace ids, the step 3 and step 5 captures, and anything unverified. Record verified bindings in `docs/gtm/dataLayer.md` (`gtm-mcp` skill, documentation loop). Publish (`publish`, admin-only) only after step 5 is observed; never publish an unverified change.

For a debug-only request, stop after step 3 with a root cause backed by a capture, and propose the fix.
