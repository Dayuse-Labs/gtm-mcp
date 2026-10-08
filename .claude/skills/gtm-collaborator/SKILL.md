---
name: gtm-collaborator
description: Help a non-technical teammate safely read or change Google Tag Manager (tracking tags, triggers, pixels) through the hosted Dayuse GTM assistant — describe the change in plain words, review a plain-language preview, then publish it yourself in the GTM UI. Use when a non-developer connects to the hosted GTM assistant and wants to change website tracking, analytics, or pixels without touching code or the repository. For hands-on developer/operator work inside the repo, use the gtm-mcp skill instead.
skillVersion: '1.0.0'
---

# Dayuse GTM — Collaborator Guide

This skill is for **non-technical teammates** changing our website tracking (Google Tag Manager) through the hosted assistant. You describe what you want in plain words; the assistant does the careful work and shows you a preview; **you publish it yourself**.

> **Golden rule: the assistant can NEVER publish a change. It only prepares it. A human (you) must publish in the Google Tag Manager UI.** Nothing the assistant does is live until you publish.

This skill is **version 1.0.0** (see `skillVersion` above).

## How it works

1. **Connect** to the assistant (its URL + your Google sign-in). You act with your own GTM permissions — nothing more.
2. **Describe the change** in plain words (e.g. "rename the daypass purchase pixel to dayaccess").
3. The assistant **finds** the affected tags / triggers / variables for you.
4. It shows you a **plain-language preview** of exactly what will change.
5. You **review** it. If correct, the assistant saves it to a **review workspace**.
6. **You publish** it in the GTM UI. ✅ Done only after you publish.

## The rules that keep you safe — non-negotiable

- **The assistant cannot publish.** It prepares a change in a review workspace; **you** publish it in the GTM UI. Always.
- **A change replaces the whole item, not one field.** The preview shows the full new version — read all of it, not just the headline.
- **The summary lists each changed field, old → new**, including values and text inside a tag. It shows at most 8 changes per item; if it says "+N more", ask the assistant for the full list with `get_changeset`.
- **If the assistant warns about "drift" / "the live version changed"** — stop. Someone else edited that item. Re-check before continuing.
- **Only 3 workspaces per container** (one is the permanent Default). If it's full, an older pending change must be rejected first — ask the assistant to do it.
- **Text buried inside a tag isn't changed by renaming.** To change a word inside a tag (e.g. a pixel event label), ask the assistant to **search** for the exact text (it uses `search_container`) — renaming the tag alone won't touch it.

## Checking real event names & values (the catalog)

When unsure what an event, property, or value is really called, the assistant checks the **authoritative catalog** (always live — never guess names):

- `list_datalayer_events` — every event the site can send.
- `get_datalayer_event {name}` — one event's fields.
- `get_datalayer_type {name}` — drill into a detail type.

Always start broad (`list_datalayer_events`), then drill into one event. The catalog is the source of truth for what the website actually sends.

## How we name things (quick reference)

- **Commercial type:** `dayaccess` — lowercase in data/conditions, `Dayaccess` capitalised in names. Legacy value was `daypass` (being retired).
- **Web trigger names:** lowercase event + qualifier, e.g. `purchase (dayaccess)`.
- **Web pixel tags:** `<Platform> - <Action> <type>`, e.g. `Facebook - Purchase dayaccess`.
- **Server tags:** `<Platform/Product> - <Qualifier> <Action>` — type is **Capitalised in names** but **lowercase in filter values**.
- **Variable prefixes:** `dlv - ` (dataLayer variable), `JS - ` / `js - ` (custom JS), `eventData - ` (server-side).
- **Purchase trigger** fires on `{{_event}} == "transaction"` AND the commercial-type clause `== "<type>"`.

## If the assistant says this skill is outdated

On connect, the assistant calls `whoami` and reads the server's `minSkillVersion`. **If this skill's `skillVersion` (1.0.0) is lower than `minSkillVersion`, the assistant will tell you the skill is out of date — ask an admin to update it before making changes.** Don't make changes with an outdated skill.
