# v1 entity scope, including custom templates

v1 supports full CRUD on: tags, triggers, variables, built-in variables, folders, server-container clients and transformations, **and custom templates**. Gallery templates are instantiated but never rewritten (editing their code detaches them from the gallery). Out of scope: zones, environments, container/account settings.

## Custom templates — deliberately in, despite the risk

Custom templates are sandboxed JavaScript + a fields UI + a permissions declaration, and editing one **fans out** to every entity that references it. We include them anyway because they unlock real capability and refactors. Risk is mitigated by:

- **Preview dependency-impact analysis** — list dependents, flag breaking parameter changes.
- **Clone-from-example** authoring from the Mirror's real entities.
- **GTM save-time validation** as a safety net, plus the human publish gate.

## Out-of-scope rationale

Zones/environments/container settings are rare or sensitive with low day-to-day payoff; deferring them keeps the agent away from high-blast-radius configuration.
