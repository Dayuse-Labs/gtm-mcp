# Conventions

> Living doc — amended by the `gtm-mcp` skill.

Naming and structure conventions observed in our GTM containers.

## Entity naming

- **Web triggers** for ecommerce events: lowercase event name with a qualifier in parentheses, e.g. `purchase (dayaccess)`. The qualifier is the commercial type.
- **Web tags** (pixels): `<Platform> - <Action> <commercialType>`, e.g. `Facebook - Purchase dayaccess`.
- **Server tags**: `<Platform/Product> - <Qualifier> <Action>`, e.g. `Google Ads Conversion Tracking - Dayaccess Purchase`, `... - Dayaccess New Client Purchase`. Note: in tag/trigger NAMES the commercial type is Capitalised (`Dayaccess`), but in trigger filter VALUES it is lowercase (`dayaccess`) because it matches the raw dataLayer/eventData string.
- **Server triggers**: `GoogleAds - <Qualifier> <action>`, e.g. `GoogleAds - Dayaccess purchase`, `GoogleAds - Dayaccess new client purchase`.
- **Variable naming prefixes** seen: `dlv - ` (dataLayer variable), `JS - ` / `js - ` (custom JS), `eventData - ` (server-side event-data variable on sGTM).

## Commercial type

- Canonical commercial-type value as of 2026-06-15: **`dayaccess`** (lowercase in data/conditions, `Dayaccess` capitalised in display/entity names).
- Renamed from the legacy value **`daypass`** (display: `Daypass`). The legacy value should no longer appear anywhere once the pending workspaces are published.

## Trigger filter shape

- Web `customEvent` purchase trigger matches on two clauses: `{{_event}} == "transaction"` (customEventFilter) AND `{{dlv - ecommerce.items.0.dayuse_additional_data.offer.commercialType}} == "<commercialType>"` (filter).
- Server `always` triggers (sGTM) gate Google Ads conversions on `{{Client Name}} == "GA4"`, `{{Event Name}} == "purchase"`, `{{eventData - commercialType}} == "<commercialType>"`, and (new-client variant) `{{isNewClient}} == "true"`.

## Editing notes (for future agents)

- `preview`/`apply` `data` is a **FULL entity-body replacement**, not a partial patch. Build it from the current mirror body (drop server-managed fields: `path`, `accountId`, `containerId`, `workspaceId`, `tagId`/`triggerId`/`clientId`, `fingerprint`, `tagManagerUrl`), then mutate.
- The `preview`/`apply` `summary` only reports NAME changes. Edits inside a body (trigger filter values, event-name strings in tag HTML) are NOT surfaced in the summary — inspect the stored changeset via `get_changeset` to confirm them.
- Event-name strings can be buried in tag HTML (e.g. Facebook pixel `fbq('track', 'Bookings Daypass', ...)`). Use `search_container` (matches any field, incl. tag HTML) to find them; renaming the entity alone does NOT update them.
- **Batch a feature into ONE changeset.** Each `apply` lands in its own fresh workspace (ADR 0005), and GTM caps a container at 3. Applying a coherent change in pieces (e.g. a GA4-forward param edit, then a variable change) splits it across workspaces — extra publishes and a faster-exhausted cap. Gather all of a feature's operations for one container into a single `preview`/`apply`. `apply` now emits a soft nudge in its note when the container already holds other workspaces.
- **Failed `apply` can leak a workspace.** We hold edit scope but not `tagmanager.delete.containers` (ADR 0003), so the rollback `deleteWorkspace` can fail with "Insufficient Permission". When it does, `apply` reports the orphan workspace id + a GTM UI link rather than claiming it discarded — **discard that workspace in the UI** (the only place with delete rights) to free the cap slot.
