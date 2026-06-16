# Two skills: an operator skill and a generated collaborator skill

The integration serves two very different agents: the **operator** (repo-resident, technical — the existing `gtm-mcp` skill) and the **Collaborator** (remote, non-technical, connects to the hosted MCP server with no repo). We keep **two skills** rather than one: evolve `gtm-mcp` as the operator skill (references `docs/gtm`, runs the living-doc loop, handles complex multi-step work), and add a **collaborator skill** that is a **generated projection** of `docs/gtm` — a stable, heavily guard-railed shell, all reachable without the repo.

## Considered Options

- **One skill for both** — rejected: the operator wants structure plus an auto-incrementing knowledge loop; the Collaborator needs an all-in-one bundle with a higher safety bar. Different audiences, different needs.
- **Collaborator skill authored independently** — rejected: re-splits the single source of truth. The bundle must be _generated_ from `docs/gtm`, not hand-written, or it drifts.

## Consequences

- **Freshness routed by churn**, not one mechanism: the stable shell ships in the bundle (rarely updated); the dataLayer **catalog** is live over MCP (ADR 0008); **conventions** are served over MCP from the canonical docs (fresh on redeploy); **bindings** are re-derived live from GTM (`search_container` / `export_container`).
- **Distribution**: the collaborator skill goes on an **org-managed channel** (Team/Enterprise admin-provisioned, or Claude Code managed settings) so one central update reaches every Collaborator with zero action. Plain claude.ai has no central management and is unsuitable.
- Skills carry **no built-in version/staleness check**, so the MCP server advertises an expected min-skill-version (a **version handshake**); a stale bundle warns the Collaborator instead of silently misbehaving.
- The collaborator bundle must encode **hard guardrails** the Collaborator cannot reason around: full-body-replace (not a patch), name-only previews, fail-on-drift, the workspace cap, and "a human must publish."
- A **rebuild step** (regenerate the bundle from `docs/gtm`) is required whenever the operator loop materially changes conventions or workflow.
