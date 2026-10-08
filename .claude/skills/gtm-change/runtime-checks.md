# Runtime checks

Techniques for steps 3 and 5 of the `gtm-change` skill, learned on our site.

## Capturing what is sent

- **Hook before the journey.** Wrap `window.fbq` (and `window.dataLayer.push`) with `javascript_tool` so each call is recorded into a window array you read back later. Hooks added after a hard load miss that load; prefer in-app navigation after hooking.
- **Meta pixel traffic does not show in `read_network_requests`.** The pixel posts through a hidden form, and on our pixel through Meta's OpenBridge endpoint (`…a.run.app/events`), not `facebook.com/tr`. Hook `fbq` for what GTM sends; hook `fetch`/form submits to see the final payload.
- **Meta adds data GTM never sent.** The final payload carries `smart_setup.auto_web_details_data` scraped by Meta's own rules (`fbq` internals → `pluginConfig._configStore.smartSetup`). Check there before blaming a GTM variable.
- **GTM's merged data model.** A dataLayer variable (version 2) keeps values from earlier pushes; read `google_tag_manager['GTM-PFRJSLZ'].dataLayer.get(key)` at the moment the tag fires, not only the latest push.

## GTM Preview

- Start Preview from the workspace in the GTM UI; Tag Assistant opens the site in a connected tab. Do the journey in that tab.
- Server container: Preview the server workspace too; its events appear only for hits sent by a web Preview session.
- Events fire after hydration; some only after a scroll or a click.

## Site specifics

- Consent: the Didomi banner must be accepted for marketing tags to fire.
- Search page: run a search from the home page ("Voir les hôtels"); `hotel_listing_view` follows `search`.
- Purchases: replay them on preprod per [preprod-purchases.md](preprod-purchases.md), never on production.
