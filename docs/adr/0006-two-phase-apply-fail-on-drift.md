# Two-phase Apply, fail-on-drift, two-tier rollback

Writes are **server-enforced two-phase**: `preview(changeset)` → `previewId`, then `apply(previewId)`. The server refuses an Apply without a prior Preview. Both phases run a **fail-on-drift** check — the changeset's referenced entities are compared by GTM `fingerprint` against a fresh Pull; any mismatch **refuses with a plain-language message** and never auto-merges.

## Why

- Non-technical Collaborators write to live infra, so a mandatory plain-language Preview is the safety rail.
- Auto-merge was rejected: too dangerous, and it would expose GTM's raw conflict UI to non-technical users. A clean "X changed in GTM since this was built — rebuild it" is safer.

## Rollback

Before-images are captured at Apply (free — already pulled for the drift check), enabling two-tier rollback: **pre-publish** → delete the workspace (true revert, frees a slot); **post-publish** → generate an inverse changeset (GTM's native "restore previous version" is the simpler alternative). The agent never auto-reverts live state.
