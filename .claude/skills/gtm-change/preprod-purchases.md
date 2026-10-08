# Preprod purchases

How to verify a purchase or checkout change (step 5 of the `gtm-change` skill). Never book on production.

## Where

- Site: `https://fr.www.dayuse-dev.com/`. Dayaccess offers: `/search-dayaccess` → hotel → offer **Select** → date → **Reserve** → `/tunnel/booking` (identification, personalization, payment).
- Some offers answer `(12004) This reservation is no longer available` for every date; pick another hotel.
- Identity: clearly fake data (`GTM Test`, `gtm-test@dayuse.com`, a 555 phone). Continue without account.
- Checkout is fully prepaid by card (Adyen); there is no pay-at-hotel path. The terms checkbox sits on the personalization step.

## What preprod loads

- Web container **GTM-WMR4DMK** "New Front (dev env)" (id 41658217, Live version), served by `sgtm.dayuse.com/tms`. Not GTM-PFRJSLZ: it is an older fork with its own tag ids, so a change applied to GTM-PFRJSLZ never runs on preprod. Read and change it through the MCP `preprod` container alias (`pull`, `export_container`, `preview`, …).
- GA4 measurement id `G-766X8CR3V2` (the lookup's `dayuse-dev` key never matches the full hostname) and transport `https://sgtm.dayuse.com`, the **production** server container GTM-P3T597G.
- Meta pixel `499608380221130`, the production pixel. Preprod bookings reach production GA4, Meta pixel and Meta cAPI.
- Consent: if the Didomi banner shows, accept it (allowed for tests). It did not show on the US dayaccess pages on 2026-10-08.

## What can be verified

- A web change runs on preprod only if it is also in GTM-WMR4DMK (a WMR4DMK workspace in Preview, or its Live version).
- A server workspace runs only in a server Preview session, fed by a web Preview session in the same browser. A human starts both from the GTM UI (Preview on the WMR4DMK workspace and on the server workspace), then drags the Tag Assistant tabs into the Claude tab group. The API cannot create workspace preview environments.
- Preview can survive payment: start Tag Assistant's Connect from the Claude tab group so the site tab opens inside it, and navigate in-app (clicks, `next.router.push`), never by typing a URL. On 2026-10-08 a first run disconnected on the payment form and the confirmation page ran the **Live** container; a second run started this way stayed connected and both previews captured the purchase. If it drops, start a new booking from a fresh Connect.

## Capturing browser vs server ids

1. Before the journey, hook `fbq` and `dataLayer.push` ([runtime-checks.md](runtime-checks.md)), saving to `sessionStorage` so captures survive page changes, and call `read_network_requests` once so network tracking starts.
2. After payment, read the `transaction` / `purchase` pushes (`ecommerce.transaction_id`) and every `fbq('track', …)` call with its fourth argument `{eventID}`.
3. Server side: in server Preview, open the Meta cAPI tag's outgoing request and read `event_name` and `event_id`. Dedup holds when both match the browser call.

## Paying

The browser agent never types card data. It stops before the payment form and hands over; a human enters an Adyen test card and clicks pay. Adyen's published test cards ([source](https://docs.adyen.com/development-resources/test-cards-and-credentials/test-card-numbers)) work only on Adyen's test platform. Expiry **03/2030**, CVC **737** (Amex: **7373**).

Suggest this card first: it completed a preprod dayaccess booking on 2026-10-08 (booking `32X6ZVRT`).

| Brand        | Number              | Country |
| ------------ | ------------------- | ------- |
| Visa Classic | 4988 4388 4388 4305 | ES      |

Other published test cards:

| Brand            | Number              | Country             |
| ---------------- | ------------------- | ------------------- |
| Visa             | 4111 1111 1111 1111 | NL                  |
| Visa debit       | 4111 1120 1426 7661 | FR (expiry 12/2030) |
| Mastercard       | 5555 5555 5555 4444 | GB                  |
| Mastercard       | 5130 2900 0000 0009 | FR                  |
| American Express | 3700 0000 0000 002  | NL                  |
| Cartes Bancaires | 4360 0000 0100 0005 | FR                  |
| CB / Visa debit  | 4035 5014 2814 6300 | FR                  |

3D Secure 2: Visa `4212 3456 7891 0006` triggers a challenge; answer with password `password`. Mastercard `5201 2815 0512 9736` is frictionless.
