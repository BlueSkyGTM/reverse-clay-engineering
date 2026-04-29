# CONTEXT.md — friction-pipeline

## What This Pipeline Is

Three-agent AI outbound system. Finds companies with diagnosable friction, enriches them forensically, synthesizes a Robert Collier-style outreach Bite. Runs nightly via Cloud Scheduler.

**Agents:** Ahab (find) → Nemo (enrich) → Neptune (synthesize)
**Stack:** Cloud Scheduler → n8n (Cloud Run) → Gemini Enterprise Agent Platform → Postgres (Cloud SQL) → Retool

## Infrastructure

| Component | Status | Detail |
|---|---|---|
| `ocean-db-cluster` | Live | PostgreSQL 15, private IP 10.5.1.3, Direct VPC Egress |
| `n8n-orchestrator` | Live | min-instances=1, always warm |
| `n8n-worker` | Live | min-instances=0, sleeps between runs |
| Retool | Live | blueskygmt.retool.com — read-only UI |
| V4 workflow JSON | Not built | Old LangChain workflows superseded |
| Agent Platform credential | Not wired | Must be renamed + wired before workflows fire |

## Campaigns

| Campaign | Output Table | Schedule |
|---|---|---|
| gtm_career_hunt | gtm_career_leads | Daily 2AM |
| gtm_upwork_hunt | gtm_upwork_leads | Daily 6AM |
| accountant_career_hunt | accountant_career_leads | Daily 4AM |
| accountant_bulk_enrichment | accountant_bulk_leads | Weekly Mon 3AM |
| accountant_upwork_hunt | accountant_upwork_leads | Daily 7AM |
| researcher_career_hunt | researcher_career_leads | Daily 2:30AM |

## The Forensic Dictionary

Four archetypes Nemo diagnoses. Neptune mirrors them in the Bite.

| Archetype | Signal |
|---|---|
| API Stutter | Disconnected systems, sync failures |
| Scale Friction | Processes that break under growth |
| Manual Data Debt | Humans doing what automation should |
| Displacement Signal | Overpaying for a tool a direct solution replaces |
