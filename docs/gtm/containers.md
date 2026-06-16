# Containers

> Living doc — amended by the `gtm-mcp` skill.

Facts about our GTM containers, accounts, and environments. Fill in from discovery.

Account id: `REDACTED_ACCOUNT_ID`.

| Alias  | Type   | Public id   | Numeric id | Notes                                                                                                                                                        |
| ------ | ------ | ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| web    | web    | REDACTED_WEB_PUBLIC_ID | REDACTED_WEB_ID   | Browser container. Large: ~81 tags, ~134 triggers, ~231 variables, 8 folders, 7 custom templates. Live/published workspace at time of writing: 388.          |
| server | server | REDACTED_SERVER_PUBLIC_ID | REDACTED_SERVER_ID   | Server-side (sGTM) container. Small: ~13 tags, ~11 triggers, ~14 variables, 7 clients, 14 custom templates. Live/published workspace at time of writing: 73. |

Notes:

- `REDACTED_EMAIL` has `collaborator` role with `ok` access to both containers.
- Per-container workspace cap (pending agent changesets): `maxPending = 2`.
- Apply writes a fresh ephemeral workspace named `AI <changeset-prefix> · <email>`. The agent never publishes (ADR 0003) — a human reviews + publishes in the GTM UI.
