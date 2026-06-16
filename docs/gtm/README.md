# GTM Living Documentation

> Living doc — amended by the `gtm-mcp` skill. Grown incrementally: each agent run reads these files to orient, then adds what it learned.

Domain knowledge for our Google Tag Manager setup, kept separate from the operating skill so it can grow over time without bloating the skill.

## Read me first — source-of-truth map

| Tier                       | Authority for                                                   | Where                                                                                | Mutability                    |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| GTM                        | container **state**                                             | live API / Mirror                                                                    | agent writes via changesets   |
| **dataLayer catalog**      | dataLayer **schema** (event names, property paths, value enums) | **MCP tools** (`list_datalayer_events`, `get_datalayer_event`, `get_datalayer_type`) | read-only, upstream-generated |
| **dataLayer bindings**     | catalog ⇄ GTM **mapping**                                       | [dataLayer.md](dataLayer.md)                                                         | operator-amends               |
| conventions / containers   | naming, structure, accounts                                     | this folder                                                                          | operator-amends               |
| `CONTEXT.md` · `docs/adr/` | language · decisions                                            | repo root                                                                            | human                         |

Drill order: read this map → if the task touches dataLayer, orient from the cheap MCP index (`list_datalayer_events`) → drill one event with `get_datalayer_event` → record any verified GTM wiring in [dataLayer.md](dataLayer.md).

## Index

- [containers.md](containers.md) — containers, accounts, environments. _(operator-amends)_
- [conventions.md](conventions.md) — naming and structure conventions. _(operator-amends)_
- [dataLayer.md](dataLayer.md) — **dataLayer bindings**: catalog ⇄ GTM mapping. _(operator-amends; the catalog itself is the MCP tools, not a file)_

## How to contribute

After a GTM read or change, append factual, concise entries to the relevant file. Prefer tables. Don't duplicate existing rows.
