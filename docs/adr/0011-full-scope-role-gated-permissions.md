# Full GTM OAuth scope, permissions gated by role

Supersedes the "no publish scope" half of ADR 0003 (per-user OAuth stays).

The server now requests every scope an agent needs to finish a change end to end: `edit.containers`, `delete.containers`, `edit.containerversions`, `publish` and `readonly`. **What a caller may actually do is enforced server-side by role** (`src/domain/services/role-policy.ts`), not by the OAuth scope.

## Why

- Without `delete.containers`, `reject` and Apply's rollback could not delete workspaces (GTM returns "Insufficient Permission"), so failed and rejected changesets leaked workspace slots on a 3-slot free plan.
- Agents verified in the browser (GTM Preview) can carry a change through to publication; making a human click Publish after that check adds latency, not safety, for trusted operators.
- Scopes are per OAuth client, not per user, so they cannot express roles. A server-side policy can, and is testable.

## Policy

| Capability                                                                          | collaborator | admin |
| ----------------------------------------------------------------------------------- | ------------ | ----- |
| Read tools, catalog, preview/apply on tags, triggers, variables, folders, built-ins | yes          | yes   |
| Preview/apply on custom templates, clients, transformations                         | no           | yes   |
| Apply/reject a changeset                                                            | own only     | any   |
| Publish (`publish` tool, only after GTM Preview verification)                       | no           | yes   |
| `usage_stats`                                                                       | no           | yes   |

Every call is still capped by the caller's own GTM permissions: a user without Publish rights in GTM gets a 403 whatever the policy says.

## Consequences

- The structural guarantee of ADR 0003 ("the agent can never publish") is gone; the guarantee is now the role policy plus GTM's own user permissions. Admin is granted only via direct DB access.
- Existing users must sign in again to grant the new scopes.
- `delete.containers` also allows deleting whole containers; the server exposes workspace deletion only.
