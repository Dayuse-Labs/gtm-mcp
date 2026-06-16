# Imperative, single-container changesets grouped by Plan

Agent changes are **imperative, ordered Operations** (create/update/delete) grouped into a **Changeset** targeting exactly one container — the unit of review, audit, and rollback. Cross-container work is coordinated by a **Plan** that groups related changesets, with **no cross-container atomicity** (GTM can't provide it). We rejected a declarative desired-state model, which would require building a Terraform-like diff/reconciliation engine for a workflow that is targeted edits, not whole-container reconciliation.

## Reference resolution

GTM assigns numeric ids on create, so references resolve at Apply time, three-tier: known id (from Mirror/Mapping) → existing entity by name → intra-changeset placeholder (`$ref:…`) for entities created earlier in the same changeset.

## Ownership

A changeset is owned by its author; only the **author** (Apply runs under their token, for clean attribution) or an **Admin** may Apply/reject it. All Collaborators can view all changesets, since the workspace cap is shared (see ADR 0005).
