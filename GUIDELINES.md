# GUIDELINES.md — friction-pipeline

## Non-Negotiable Rules

- `pipeline/memory/schema_map.sql` is the only source of truth for schema. Check it before any database operation.
- `framework/agents/` base YAMLs are not campaign-specific. Never modify them for a single campaign's fix.
- `pipeline/nodes/campaigns.json` is the only source of truth for search arrays. Never hardcode in n8n nodes.
- `fleet_app` for all runtime connections. Never `pipeline_admin` at runtime.
- Never push `pipeline/` or `campaigns/` to a public repo. `framework/` only.
- Never run infrastructure commands autonomously. Write the command, Ray runs it.

## Agent Rules

- Agents are hosted models — system prompts live on Agent Platform, not in workflow request bodies.
- Ahab and Nemo are headless data processors. Neptune is a reasoning model — the persona is the point.
- The Forensic Dictionary has 4 archetypes: API Stutter, Scale Friction, Manual Data Debt, Displacement Signal. All four are active in every campaign.
- Temperature: Ahab 0, Nemo 0, Neptune 0.7. Do not change Neptune's temperature — it governs copy variation.

## Prompt Rules

- Stage before promoting. Every prompt change goes to `campaign_staging_area.md` first.
- Test in Agent Platform AI Studio before any change goes live.
- Campaign prompt library files aim the agents — they do not add intelligence.

## Schema Rules

- Update `schema_map.sql` before touching the database.
- New campaign = new table. Use `framework/schema/campaign_template.sql`.
- `fleet_errors` is where SHIPWRECKED leads go. Never halt the workflow for a bad lead.

## Decision Rules

- Locked decisions live in `DECISIONS.md`. Do not re-litigate without updating DECISIONS.md first.
- If something contradicts a locked decision, flag it to Ray before acting.
