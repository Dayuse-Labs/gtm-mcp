# GTM is the source of truth; local is a disposable mirror

GTM remains authoritative. The project keeps a disposable local **Mirror** refreshed by one-way **Pull** (GTM → local), and all writes go through reviewable **Changesets** **Applied** back to GTM. We rejected config-as-code (would force every edit through the repo and fight the team's existing GTM-UI workflow) and true bidirectional sync (GTM has no change-feed/webhooks and no merge primitives, so conflict resolution would be ours to invent — a trap).

## Consequences

- GTM-UI edits stay first-class; people keep working in GTM directly.
- The Mirror can be stale → drift handling is required (see ADR 0006).
- The Mirror is derived and never git-tracked.
