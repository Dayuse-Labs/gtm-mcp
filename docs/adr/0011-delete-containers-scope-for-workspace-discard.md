# Add the `delete.containers` scope for workspace discard

We add `https://www.googleapis.com/auth/tagmanager.delete.containers` to the requested OAuth
scopes (ADR 0003's list) so a Collaborator can **discard an agent-created ephemeral workspace**:
the `reject` tool deletes the workspace an Apply created, freeing one of GTM's 3 per-container
slots (ADR 0005), and reconciles the Changeset to `rejected`. The same scope backs rollback
cleanup (an Apply that fails mid-write already self-discards its workspace, ADR 0006).

This **revises ADR 0003's scope list** but **keeps its "never publish" stance** intact:
`delete.containers` governs workspaces/entities only — it grants no publish capability. As with
every write path, GTM still caps the user to the intersection of the scope and their existing
GTM role, so a read-only GTM user cannot delete.

## Why

- ADR 0005 promised "reject frees a slot", but the tool was an inline stub with no real discard
  path and no graceful handling of an already-gone workspace. Without the delete scope the call
  would 403. The scope makes the documented behaviour real.
- Least privilege: we request the **narrowest** delete scope (containers/workspaces), not a
  broader management scope, and still omit publish.

## Consequences

- **RE-CONSENT REQUIRED.** The new scope is not present in already-issued refresh tokens, so
  existing Collaborators must re-run `/oauth/login` to re-consent before they (or an admin acting
  on their behalf) can discard a workspace. Pre-existing tokens keep working for every other tool
  but will 403 on workspace deletion until re-consent.
- Authorization mirrors Apply (Q15 / ADR 0004): only the changeset **author** or an **admin** may
  discard a changeset (`canActOn`), resolved via the `ChangesetRepository`.
- Discard is **idempotent**: a GTM 404 (workspace already published/deleted by a human, or a prior
  discard) is surfaced as a typed `WorkspaceNotFoundError` and treated as success — the status is
  still reconciled to `rejected`. Any other delete failure (permission/other) surfaces as an error;
  the tool never claims success on a real failure.
- No new `ChangesetStatus`: discard reuses the existing `rejected` terminal status.
