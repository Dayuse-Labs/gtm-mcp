# Per-call observability log, separate from the audit trail

We log **every MCP tool call** — reads and writes alike — as one row in a dedicated `tool_call` table, to answer two questions: **usage per collaborator** (who calls which tools, how often) and **is everything going right** (per-call outcome, error, duration). This is a **best-effort observability log**, deliberately distinct from the `audit_event` table (migration `0001`), which is reserved for the durable, state-changing **Changeset** audit trail and which this ADR leaves untouched (still unwired). A single `withLogging` wrapper around every `registerTool` callback captures `tool`, `container`, `outcome`, `error_message`, `duration_ms`, `collaborator_id`, and `session_id`; identity for logging is resolved by a cheap collaborator lookup split out from the expensive `ActorContext.resolve()` (which also builds the GtmClient), so even read tools that never touch GTM are attributed. Reads happen through an **admin-only `usage_stats` MCP tool**; proactive error alerting is deferred to the existing Google Chat webhook work (README stub #4).

## Considered Options

- **Repurpose the existing `audit_event` table** — rejected. Its semantics are "every state-changing action" with a `changeset_id` link; widening it to all reads and adding outcome/duration would blur a compliance-grade audit trail with best-effort observability. Two tables, two purposes.
- **Store raw tool args** — rejected. `preview` carries full `operations[]` bodies and `search_container` a free-text query; logging them bloats rows and widens the RGPD surface for no gain. We store a **sanitized summary only** (`container` as a column, shape hints like `opsCount`/`queryLength`), never raw arg bodies.
- **Durable, awaited writes** — rejected. The log is observability, not a financial record; rows need no perfect insert ordering (`created_at`, stamped in-app at call completion, plus `bigserial id` order any analysis). We **fire-and-forget** the insert with a swallowed `.catch`, so a logging fault never slows or fails the user's call.
- **Per-handler log lines** — rejected. 18 edit sites, easy to miss one. A single central wrapper catches every tool uniformly.

## Consequences

- **`collaborator_id` is `ON DELETE SET NULL`** and rows have a **bounded retention** (default 90 days via `TOOL_CALL_RETENTION_DAYS`), purged by the same scheduled job that will handle pending-changeset TTL (stub #4). Health/error history survives a person leaving, de-attributed; nothing is hoarded indefinitely (RGPD data minimization).
- **Per-collaborator attribution is only meaningful once per-request transport-OAuth lands** (README stub #1). Until then, dev resolves the single most-recent login, so every row attributes to one collaborator. The schema and wrapper are correct ahead of that work; only the identity source upgrades.
- `usage_stats` is the **first role-gated tool** — it checks `collaborator.role === 'admin'` (the role already returned by `resolve()`).
- The two tables now coexist: a live `tool_call` and an empty `audit_event`. This ADR is the answer to "why two, why is one empty."
