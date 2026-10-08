# Conventions

> Living doc — amended by the `gtm-mcp` skill.

Naming and structure conventions observed in our GTM containers.

## Entity naming

- **Web triggers** for ecommerce events: lowercase event name with a qualifier in parentheses, e.g. `purchase (dayaccess)`. The qualifier is the commercial type.
- **Web tags** (pixels): `<Platform> - <Action> <commercialType>`, e.g. `Facebook - Purchase dayaccess`.
- **Server tags**: `<Platform/Product> - <Qualifier> <Action>`, e.g. `Google Ads Conversion Tracking - Dayaccess Purchase`, `... - Dayaccess New Client Purchase`. Note: in tag/trigger NAMES the commercial type is Capitalised (`Dayaccess`), but in trigger filter VALUES it is lowercase (`dayaccess`) because it matches the raw dataLayer/eventData string.
- **Server triggers**: `GoogleAds - <Qualifier> <action>`, e.g. `GoogleAds - Dayaccess purchase`, `GoogleAds - Dayaccess new client purchase`.
- **Server Meta tags**: `Facebook cAPI - <Qualifier> <Action>`, trigger `Facebook - <Qualifier> <action>`, e.g. `Facebook cAPI - Dayaccess Purchase` on `Facebook - Dayaccess purchase` (server ws 83).
- **Variable naming prefixes** seen: `dlv - ` (dataLayer variable), `JS - ` / `js - ` (custom JS), `eventData - ` (server-side event-data variable on sGTM).
- **Reuse a signal's established name across containers — don't invent synonyms.** A value already named client-side keeps that name when forwarded to and read on the server. E.g. the Meta consent signal is `JS - didConsentToFacebook` web-side → forward it on the GA4 hit as `didConsentToFacebook` and read it server-side as `eventData - didConsentToFacebook` (NOT a new name like `fb_consent`). One name end-to-end keeps the dataLayer→sGTM flow greppable.

## Commercial type

- Canonical commercial-type value as of 2026-06-15: **`dayaccess`** (lowercase in data/conditions, `Dayaccess` capitalised in display/entity names).
- Renamed from the legacy value **`daypass`** (display: `Daypass`). The legacy value should no longer appear anywhere once the pending workspaces are published.

## Trigger filter shape

- Web `customEvent` purchase trigger matches on two clauses: `{{_event}} == "transaction"` (customEventFilter) AND `{{dlv - ecommerce.items.0.dayuse_additional_data.offer.commercialType}} == "<commercialType>"` (filter).
- Server `always` triggers (sGTM) gate Google Ads conversions on `{{Client Name}} == "GA4"`, `{{Event Name}} == "purchase"`, `{{eventData - commercialType}} == "<commercialType>"`, and (new-client variant) `{{isNewClient}} == "true"`.

## Editing notes (for future agents)

- **Meta dedup** needs the same event name AND the same event id from browser and server. The server `Facebook Conversion API` template (12) defaults `event_id` to `eventData.transaction_id`; browser pixels pass `eventID: {{dlv - ecommerce.transaction_id}}`.
- Server tag 15 `Facebook cAPI` carries `testId = TEST54905`: while set, its events land in Meta Test Events, not production.
- `preview`/`apply` `data` is a **FULL entity-body replacement**, not a partial patch. Build it from the current mirror body (drop server-managed fields: `path`, `accountId`, `containerId`, `workspaceId`, `tagId`/`triggerId`/`clientId`, `fingerprint`, `tagManagerUrl`), then mutate.
- The `preview`/`apply` `summary` lists field-level changes (old → new, long strings shown as a focused diff), capped at 8 per operation with "+N more". Use `get_changeset` for the full body.
- Event-name strings can be buried in tag HTML (e.g. Facebook pixel `fbq('track', 'Bookings Daypass', ...)`). Use `search_container` (matches any field, incl. tag HTML) to find them; renaming the entity alone does NOT update them.
- **Change client + server together — never ship half a flow.** A tracking change usually spans both containers (web emits/forwards; sGTM consumes/sends). Author the web changeset AND its server counterpart in the same pass (a Plan) so the full `dataLayer → sGTM → tag` path exists at once and is testable **end-to-end in one GTM Preview session**. A client-only or server-only half-state can't be validated and risks a live gap. (Each container is still its own changeset/workspace — there's no cross-container atomicity; pair them, preview both, publish both.)
