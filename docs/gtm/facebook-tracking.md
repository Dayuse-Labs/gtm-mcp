# Facebook / Meta tracking

> **Source of truth:** GTM (wiring) + the dataLayer catalog (what's real) · **Mutability:** operator-amends · **Audience:** operator / repo agent
>
> The dedicated reference for Meta (Facebook) Pixel **+** Conversions API across both containers: which tags fire, what event names they use, how the two sides dedup, what `user_data` we send, and how consent gates it. Design rationale is [ADR 0011](../adr/0011-meta-capi-internal.md). General bindings stay in [dataLayer.md](dataLayer.md); don't duplicate rows.

## Dataset

- **Pixel id:** `499608380221130` (public; embedded in every pixel tag's HTML). Access token lives only in the sGTM tag config + Railway secrets — **never** in this repo.
- **Client side:** web container, inline `fbq()` pixel tags.
- **Server side:** server container (sGTM, **Addingwell**-hosted). CAPI sender = Stape **"Facebook Conversion API"** custom template (`cvt_..._12`).

## Conversions ⇄ event names (the dedup map)

Meta dedups a pixel event and its CAPI twin **only** when `event_name` byte-matches **and** `event_id` matches. Names are **case-sensitive** and custom.

| Conversion (Meta) | Pixel `event_name` | Web tag | Web trigger | Campaign use | Notes |
| ----------------- | ------------------ | ------- | ----------- | ------------ | ----- |
| **Achat** | `Purchase` | 836 `Facebook - Purchase` | 1092 `purchase` | 🟢 unused — safe to change | `content_type: hotel` |
| **GTM purchase** | `GtmPurchase` | 1096 `Facebook - GtmPurchase` | 1092 `purchase` | 🚨 **all campaigns** — change only when proven | adds `commercialType`, `country` |
| **GTM transaction** | `GtmTransaction` | 1526 `Facebook - GtmTransaction` | 609 `transaction` | 🟢 unused — **CAPI pilot** | fires on the `transaction` dataLayer event |

> The `transaction` dataLayer event also drives the GA4 forward tags `871 GA4-Event purchase` (sends GA4 `purchase`) and `1109 GA4-Event gtm_purchase` (sends GA4 `gtm_purchase`) to sGTM. **Do not** let CAPI inherit those GA4 names — set `event_name` explicitly to the pixel string above.

## Dedup contract

- **`event_id`** = `{{dlv - ecommerce.transaction_id}}` — the value the pixel **already** sends as `eventID` on all three tags. CAPI sends the **same value, unchanged, unhashed**, on both sides. Parity by construction (ADR 0011).
- **`event_name`** = the exact pixel string for that conversion (table above), set explicitly per CAPI tag — not `Purchase`, not the GA4 name.
- Snowflake reconciliation (`transaction_id` vs `fct_order` UUID) is an **analyst** check, decoupled — CAPI does not depend on it.

## CAPI `user_data` (matching signals)

Assembled in **one server-side variable**; the Stape tag normalizes + SHA-256-hashes. The pixel sends **no** PII today, so there is no client/server hash-parity constraint.

| Meta key | Source (web dataLayer var) | Hash | Notes |
| -------- | -------------------------- | ---- | ----- |
| `em` | `1027 …booking.customerEmail` | required | |
| `ph` | `1030 …booking.customerPhoneNumber` | required | |
| `fn` | `1028 …booking.customerFirstName` | required | first name |
| `ln` | `1029 …booking.customerLastName` | required | last name |
| `ct` | booking city (`customer_city`) | required | optional — drop if complex |
| `country` | booking country (`customer_country`) | required | optional |
| `external_id` | **booking UUID** | recommended | per operator. ⚠️ per-order id → ~no cross-event matching value; `dlv - customer_uuid` (#945) would match better. Place as 2nd param |
| `client_ip_address` | sGTM request IP | **no** | |
| `client_user_agent` | sGTM request UA | **no** | |
| `fbc` / `fbp` | cookies (`generateFbp: true`) | **no** | confirm `fbc`/`fbclid` capture — feasibility tbc |

`custom_data`: `value`, `currency`, `content_ids`, `content_type` (`product`), `isFirstBooking`, `IS_REACTIVATED`.

## Consent gating

Stack uses **per-vendor (Didomi)** consent at the **trigger** level — GTM consent mode is unused (`consentSettings: notSet` on every FB tag).

- Web: forward `fb_consent = {{JS - didConsentToFacebook}}` (#909) on the GA4 hit (tags 871, 1109).
- sGTM: each CAPI tag's trigger requires `Client Name == GA4` **AND** `facebookEventFilter == true` **AND** `eventData - fb_consent == "true"` (string, matching the `facebookEventFilter` convention).
- ⚠️ **Gap to verify:** the 3 conversion pixels fire on **non-consented** triggers (1092, 609), unlike other FB events that use `… (consent Facebook)` triggers (e.g. 615, 613, 602). Confirm whether Didomi blocks the pixel load upstream or Purchase fires without FB consent (RGPD), and point CAPI at the consented path regardless.

## Current state

- `15 Facebook cAPI` (sGTM) — **`paused: true`**, verified against live GTM **2026-06-16**. It is the **only** Meta sender in sGTM. One global tag (`inheritEventName`, trigger 14), in test mode (`testId TEST54905`, `logType: debug`).
- Our server-side CAPI is therefore **off for every conversion**. There is **no per-conversion control** on our side — that distinction exists only in Meta's hosted solution (Events Manager, not this repo).
- **Step 1 (deactivate our sGTM CAPI): done.** Left paused on purpose — reused in step 2.

## Build status (step 2+, not started)

1. GA4 forward (871, 1109) carries customer fields + `fb_consent`.
2. sGTM: `user_data` variable + `eventData - fb_consent` variable.
3. **Replace** tag 15 with one explicit-`event_name` CAPI tag per conversion; pilot = `GtmTransaction`.
4. Strip `testId` + `debug`; confirm `fbc`/`fbp`.
5. Verify dedup rate + volume vs Tableau in Events Manager → replicate on `GtmPurchase`.

Deadline: Meta's hosted solution sunsets **September 2026**.
