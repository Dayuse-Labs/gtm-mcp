# dataLayer

> Living doc — amended by the `gtm-mcp` skill.

The dynamic catalogue of dataLayer events and properties. Add an entry whenever you verify one from a container or the site.

## How to add an entry

Append a row with the fact you verified (name, where observed, notes). Keep it factual; don't duplicate.

## Events

| Event                                    | Description                                                                             | Where observed                                                                                                                          | Notes                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transaction`                            | Web dataLayer purchase/transaction push that fires the web purchase trigger.            | web trigger `purchase (dayaccess)` (id 1538), `customEventFilter` `{{_event}} == "transaction"`                                         | The GA4-style ecommerce payload rides on this event.                                                                                             |
| `purchase`                               | GA4 event name evaluated server-side to gate Google Ads conversions.                    | server triggers `GoogleAds - Dayaccess purchase` (57), `GoogleAds - Dayaccess new client purchase` (59), `{{Event Name}} == "purchase"` | This is the GA4 event name, NOT the commercial type — leave unchanged.                                                                           |
| `Bookings Dayaccess` (pixel event label) | Facebook pixel custom event label sent via `fbq('track', 'Bookings Dayaccess', {...})`. | web tag `Facebook - Purchase dayaccess` (1539), `parameter[html]`                                                                       | Renamed from `Bookings Daypass` on 2026-06-15. This is an analytics/pixel event-name string carried inside tag HTML, not a dataLayer event push. |

## Properties

| Property                                                        | Type               | Description                                                                           | Where observed                                                                             | Notes                                                   |
| --------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `ecommerce.items.0.dayuse_additional_data.offer.commercialType` | string             | Commercial type of the booked offer. Value `dayaccess` (was `daypass`).               | web trigger 1538 filter; web tag 1539 (`{{dlv - ...}}`)                                    | Drives which web purchase pixel fires.                  |
| `commercialType` (server eventData)                             | string             | Server-side mirror of the commercial type. Value `dayaccess` (was `daypass`).         | server triggers 57 & 59 (`{{eventData - commercialType}}`)                                 | Drives which Google Ads server conversion fires.        |
| `isNewClient` (server eventData)                                | boolean-ish string | Whether the booking is a new client's first. Matched as `== "true"`.                  | server trigger 59 (`{{isNewClient}}`)                                                      | Distinguishes new-client vs all-client conversion tags. |
| `ecommerce.value`                                               | number             | Transaction value.                                                                    | web tag 1539 (`{{dlv - ecommerce.value}}`)                                                 | Sent as FB pixel `value`.                               |
| `ecommerce.transaction_id`                                      | string             | Transaction id, used for FB event dedup (`eventID`).                                  | web tag 1539 (`{{dlv - ecommerce.transaction_id}}`)                                        |                                                         |
| `ecommerce.items.0.dayuse_additional_data.hotel.countryCode`    | string             | Hotel country code.                                                                   | web tag 1539                                                                               | Sent as FB pixel `country`.                             |
| `site_currency`                                                 | string             | Site currency.                                                                        | web tag 1539 (`{{dlv - site_currency}}`)                                                   |                                                         |
| `commissionCurrency` / commission value (server)                | string/number      | Commission currency + (decrypted) value used as Google Ads conversion value/currency. | server tags 60 & 61 (`{{eventData - commissionCurrency}}`, `{{decryptedCommissionValue}}`) |                                                         |

## Changelog

- **2026-06-15** — Commercial type renamed `daypass` → `dayaccess` (display `Daypass` → `Dayaccess`). Applied to fresh review workspaces (NOT published):
  - web container (REDACTED_WEB_PUBLIC_ID): changeset `e6a123ba-b9e1-4525-af52-e97ad0813e44`, workspace **390** — trigger 1538 + tag 1539 (incl. FB pixel event label `Bookings Daypass` → `Bookings Dayaccess`).
  - server container (REDACTED_SERVER_PUBLIC_ID): changeset `df4c494c-f02f-456b-b4c9-0a99338df552`, workspace **75** — tags 60 & 61 (names) + triggers 57 & 59 (names + filter values).
  - Note: a prior incomplete web changeset exists in workspace **389** (renamed entities but did NOT fix the in-HTML `Bookings Daypass` label). Workspace 390 is the complete superset; 389 should be discarded by a human in the GTM UI to avoid a duplicate/stale workspace.
