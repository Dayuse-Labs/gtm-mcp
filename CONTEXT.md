# GTM Integration

A remote MCP server that lets collaborators use an AI agent to read and change two Google Tag Manager containers (web + server), where GTM stays the source of truth and every agent-made change is captured as a reviewable, replayable record.

## Language

### Sync

**Pull**:
Read current GTM state into the local mirror. One-directional: GTM → mirror.
_Avoid_: sync, fetch, import

**Apply**:
Execute a changeset's operations into a GTM workspace. One-directional: changeset → GTM.
_Avoid_: push, deploy, sync

**Publish**:
The human action, performed in the GTM UI, that turns a workspace into a live container version. Never performed by the agent — the MCP holds no publish scope.
_Avoid_: release, ship, go-live

**Mirror**:
The disposable local read-cache of current GTM state, refreshed by a Pull. Derived, never the source of truth, never git-tracked.
_Avoid_: snapshot, cache, copy

**Mapping**:
The per-container table resolving an entity's stable name ⇄ GTM-assigned numeric id. Refreshed on Pull.
_Avoid_: index, lookup

### Change model

**Changeset**:
An ordered list of imperative operations targeting exactly one container, applied atomically into a single GTM workspace. The unit of review, audit, and rollback.
_Avoid_: migration, change, diff, patch

**Operation**:
A single create / update / delete of one GTM entity within a changeset. Carries references resolved at Apply time.
_Avoid_: action, step, mutation

**Preview**:
The first phase of a two-phase Apply: a plain-language + structured summary of a changeset's operations plus a drift check, referenced by a short-lived id. Apply refuses to run without a valid Preview id.
_Avoid_: plan, dry-run, diff, simulation

**Before-image**:
The full prior state of an entity, captured at Apply time (from the drift pull) before an Operation changes it. Enables pre-publish workspace discard, post-publish inverse changesets, and audit of both sides of a change.
_Avoid_: snapshot, undo-record

**Plan**:
A grouping of related changesets across both containers (e.g. a web change plus its server-side counterpart). Coordinates intent only — there is no cross-container atomicity; each changeset is still applied and published independently.
_Avoid_: batch, bundle, release

### GTM structure

**Container**:
A GTM configuration unit. This project tracks exactly two, addressed by alias.
_Avoid_: tag manager, GTM

**Web container** (alias `web`):
The client-side container running in the browser. Holds tags, triggers, variables, built-in variables, templates, folders.

**Server container** (alias `server`):
The server-side (sGTM) container. Holds the web entity types **plus clients and transformations**.

**Workspace**:
GTM's draft layer over the live version. Edits live here until published. Free plan caps a container at 3 (one is the permanent Default), so only 2 agent changesets can be pending at once.
_Avoid_: draft, branch

**Client** _(server only)_:
A server-container entity that claims and parses incoming requests into events.

**Transformation** _(server only)_:
A server-container entity that modifies event data before it reaches tags.

**Custom template**:
A locally-authored, in-scope entity defining a reusable tag/variable type: sandboxed JavaScript + a fields UI + a permissions declaration, serialized into one blob. Editing one fans out to every entity that references it, so template Operations carry dependency-impact analysis in their Preview.
_Avoid_: template (ambiguous with gallery), CVT

**Gallery template**:
A template whose code is owned upstream in the community gallery. Instantiated by the agent but never rewritten — editing its code would detach it from the gallery.
_Avoid_: community template

### dataLayer

**dataLayer catalog**:
The authoritative, upstream-generated schema of every dataLayer event the site can emit — event names, property paths, and value enums. Read-only and served by the MCP catalog tools; never vendored or hand-edited.
_Avoid_: schema, types, events file, catalogue

**dataLayer bindings**:
The verified mapping from dataLayer events/properties to the GTM entities that consume them. Hand-grown in `docs/gtm`; references the dataLayer catalog for what is real.
_Avoid_: dataLayer doc, mapping table

### Actors

**Collaborator**:
A (typically non-technical) team member who connects an MCP client to the hosted server via URL + Google sign-in. Acts in GTM with exactly their own existing GTM rights — no more. Owns the changesets they author; only the author can Apply/reject their own changeset (Apply runs under the author's token).
_Avoid_: user, operator, editor

**Admin**:
A trusted Collaborator (role stored in Postgres, granted via direct DB access) who may additionally act on _others'_ changesets — chiefly to reject a stuck pending changeset and free a workspace slot when its author is unavailable.
_Avoid_: owner, superuser, root

### Observability

**Tool-call log**:
The per-Collaborator record of every MCP tool invocation and its outcome (ok/error + duration) — the basis for usage-per-Collaborator and "is everything going right" visibility. Best-effort, not a compliance trail; carries a sanitized arg summary, never raw operation bodies or query text. Distinct from the Changeset audit trail.
_Avoid_: audit, audit log (reserved for the Changeset sense), telemetry, metrics, analytics

**Error alert**:
The proactive push to the team's ops channel when a tool call fails — the active half of "is everything going right" (the Tool-call log is the passive half). Deduplicated within a cooldown so a repeating failure notifies once, not continuously.
_Avoid_: notification, warning, page
