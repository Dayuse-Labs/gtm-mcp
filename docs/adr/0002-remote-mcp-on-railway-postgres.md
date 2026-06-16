# Integration is a remote MCP server on Railway, backed by Postgres

The integration surface is a **remote (Streamable HTTP) MCP server** hosted on Railway with a Postgres store — not a local CLI/stdio tool. The driving requirement: (typically non-technical) Collaborators must plug in with just a **URL + Google sign-in**, zero local install or credentials on their machines.

## Considered Options

- **Local stdio MCP / CLI** — rejected: each person needs Node, a local credential file, and config; distributing credentials to non-technical staff is unsafe.
- **Remote hosted MCP** — chosen: one place to host, credentials custodied server-side, central access control and revocation.

## Consequences

- Requires hosting, transport-level auth (see ADR 0003), and multi-user state in Postgres.
- Core sync logic is kept as a library so a CLI or other MCP clients can wrap it later without rework.
