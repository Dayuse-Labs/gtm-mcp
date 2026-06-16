# Ephemeral per-changeset GTM workspace on the free plan

Each Changeset is Applied into its own fresh GTM workspace, which a human reviews, publishes, and thereby consumes. Chosen over a shared workspace for cleanest per-change isolation and audit.

## Constraint

The GTM **free plan caps a container at 3 workspaces** (one is the permanent Default), and the agent never publishes (ADR 0003), so workspaces persist until a human publishes them → **only 2 pending changesets per container at once**.

## Guardrails

- **Cap-guard:** before creating a workspace, refuse at the limit with an actionable message (not a raw GTM 409).
- **Reject frees a slot:** rejecting deletes the pending workspace — no publish needed.
- **Named workspaces** encode changeset id + author for the UI reviewer.
- **TTL auto-reject:** changesets left unpublished past a configurable window are auto-rejected, slot reclaimed, author notified.

## Fallback (documented improvement)

If publish-lag still exhausts the 2 slots, switch to a single shared "AI Changes" workspace with per-changeset isolation tracked in Postgres (pairs with an approval-queue dashboard).
