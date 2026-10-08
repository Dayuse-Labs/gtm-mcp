# Per-user Google OAuth, with no publish scope

> **Partly superseded by [ADR 0011](0011-full-scope-role-gated-permissions.md):** per-user OAuth stands; the scope set and the no-publish guarantee do not.

Each Collaborator authenticates with **their own Google OAuth** (internal `dayuse.com` app, single sign-in that also yields GTM access). The server requests only `tagmanager.edit.containers` + `tagmanager.readonly` — **never the publish scope**. We rejected a shared service account.

## Why

- **Attribution + least privilege:** every change is attributed to the human, and capped to the _intersection_ of the OAuth scope and that user's existing GTM role. A read-only GTM user gets 403 on edits; no access → 403. They can never exceed their GTM rights.
- **Structural no-publish:** omitting the publish scope guarantees the agent can never publish a version — even for a Collaborator who has Publish rights in GTM. Safer than relying on never _calling_ publish.

## Consequences

- Humans publish in the GTM UI; the agent only stages into workspaces.
- Per-user Google refresh tokens are stored encrypted (AES-GCM) in Postgres.
