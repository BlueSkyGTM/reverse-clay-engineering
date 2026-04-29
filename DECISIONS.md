# DECISIONS.md  Locked Decisions
**Rule:** These are closed. Do not re-litigate without a strong reason. If a decision needs revisiting, note it in STATE.md first.

---

| Decision | Rationale | Date |
|---|---|---|
| Retool replaces NocoDB | NocoDB CE paywall blocked Sync Schema. Retool connects directly to Postgres with zero schema coupling. Never adopt a visibility tool that writes to your database. | 2026-04-25 |
| Direct VPC Egress, not VPC connectors | VPC connectors were created by CLI as workarounds and went into ERROR state. Direct VPC Egress is the correct connection method for Cloud Run  Cloud SQL. | 2026-04-25 |
| n8n internal crons replaced by Cloud Scheduler | n8n internal crons don't fire at min-instances=0 on the worker. Cloud Scheduler wakes the orchestrator on schedule. | 2026-04-25 |
| All workflow backups in `campaigns/{name}/workflow.json` | Not `pipeline/exports/`. Campaign directories are the source of truth for workflow JSONs. | 2026-04-25 |
| `nocodb_data` is the fleet database | Not `n8n_data`. All 6 campaign tables + 3 fleet tables live in `nocodb_data`. | 2026-04-21 |
| `fleet_app` for runtime, `pipeline_admin` for schema ops | `fleet_app` has no DDL access  protects schema from n8n/Retool accidents. `pipeline_admin` only for CLI schema operations. | 2026-04-21 |
| Gemini CLI banned from database operations | CLI cannot be constrained to a single task. Confirmed 2026-04-23  began exploring directories immediately. Use `gcloud sql connect` with Claude Code ask gate only. | 2026-04-23 |
| Accountant bulk enrichment stays as-is | Source data is QBO-tier health signals for SMB owners. ICP and prompts unchanged. White-label pivot lands on career/upwork hunts instead. | 2026-04-27 |
| Two-layer file architecture | Agent layer (CLAUDE.md, STATE.md, schema, configs) stays minimal and current. Pair programming layer (DECISIONS.md, CONTEXT.md, campaign_staging_area.md) is allowed to be historical. Never mix the two. | 2026-04-27 |
| `"Email"` is a required field in all campaign output tables | Email was absent from original schema and Nemo prompts. Added to all 6 tables via ALTER TABLE and to all 6 Nemo response schemas. Nemo is responsible for finding and returning contact email. | 2026-04-27 |
| Public repo = `framework/` only | `pipeline/` contains credentials and private infrastructure. Never push `pipeline/` to a public repo. Copy `framework/` only. | 2026-04-25 |
| Forensic Dictionary is universal — one framework, multiple channels | Simulation-tested across GTM, accounting, and research domains (2026-04-28). Friction framework outperforms simplified pain/solution approach in every domain. The framework is not replicated in new workspaces — it is aimed via the prompt library. New workspaces = new acquisition channels only. | 2026-04-28 |
| Agents are hosted models with agnostic system prompts | Ahab, Nemo, Neptune deployed as persistent hosted agents in Agent Platform. System prompts baked in at platform level — not injected inline per HTTP Request call. Prompt library and candidate profile inject campaign context into user turn only. Ahab and Nemo are headless data processors. Neptune is a reasoning model — the persona is the point. | 2026-04-28 |
