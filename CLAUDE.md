# CLAUDE.md — NocoDB Fleet
**Read STATE.md first. It has the current pickup point and blocking issues.**

---

## Context Loading (Claude infers — user does not declare)

**If the session is about execution** (fixing workflows, schema changes, debugging n8n, Retool, Cloud SQL):
- Read: `STATE.md` → `pipeline/memory/schema_map.sql` → relevant `config.yaml`
- Act precisely. One job at a time. Stop and report.

**If the session is about strategy** (prompt review, ICP, campaign design, architecture):
- Read: `DECISIONS.md` → `pipeline/prompts/campaign_staging_area.md` → `framework/agents/`
- Reason before acting. Nothing moves to a live file without staging area alignment.

Ray directs the session. Claude reads the intent from the first message and loads accordingly.

---

## Routing

| You want to... | Go to |
|---|---|
| Current infrastructure state and pickup point | `STATE.md` |
| Locked decisions — do not re-litigate | `DECISIONS.md` |
| Start or amend a campaign | `framework/setup/new_campaign.md` |
| Campaign config (ICP, signals, schedule) | `campaigns/{name}/config.yaml` |
| Campaign prompt files | `campaigns/{name}/*_prompt.yaml` |
| Prompt library (campaign-specific injections) | `framework/prompt_library/{name}.yaml` |
| Stage a prompt change before going live | `pipeline/prompts/campaign_staging_area.md` |
| Baseline agent behavior (never campaign-specific) | `framework/agents/` |
| Agent Platform API call structure | `framework/api/agent_platform_call.md` |
| Credentials, URLs, infrastructure IDs | `pipeline/infrastructure/sovereign_hub.md` |
| Re-import a workflow to n8n | `campaigns/{name}/workflow.json` → n8n UI |
| Database schema | `pipeline/memory/schema_map.sql` → then Cloud SQL |
| Fleet table reference | `pipeline/infrastructure/table_guide.md` |
| Search arrays (never hardcode in n8n) | `pipeline/nodes/campaigns.json` |
| Node library for workflow builds | `pipeline/nodes/library.json` |
| Cloud Scheduler setup commands | `pipeline/infrastructure/sovereign_hub.md` → Cloud Scheduler section |

---

## What This Is

Three-agent AI pipeline for nightly lead discovery, forensic enrichment, and outreach synthesis.

**Stack:** Cloud Scheduler → n8n (Cloud Run) → Gemini via Gemini Enterprise Agent Platform → Postgres (Cloud SQL / `nocodb_data`) → Retool (read-only UI)

**Agents:** Ahab (find) → Nemo (enrich) → Neptune (outreach synthesis)

**Architecture:** HTTP Request nodes call Agent Platform generateContent endpoint directly. No LangChain nodes. Campaign specifics are injected via the prompt library at runtime.

**Campaigns:**

| Campaign | n8n ID | Output Table | Schedule |
|---|---|---|---|
| GTM Career Hunt | `j0YScDKlWNdUpO4W` | `gtm_career_leads` | Daily 2AM |
| GTM Upwork Hunt | `eYdSTWJu8OwEwiDo` | `gtm_upwork_leads` | Daily 6AM |
| Accountant Career Hunt | `SNOoU5UuEthRyGqD` | `accountant_career_leads` | Daily 4AM |
| Accountant Bulk Enrichment | `FT8gDx9LlzUBPqAD` | `accountant_bulk_leads` | Weekly Mon 3AM |
| Accountant Upwork Hunt | `JL2AfFJLJnBb5Rr9` | `accountant_upwork_leads` | Daily 7AM |
| Researcher Career Hunt | `BijuIvXReDoIj4Lo` | `researcher_career_leads` | Daily 2:30AM |

---

## Key Rules (durable — never change without updating DECISIONS.md)

1. `pipeline/memory/schema_map.sql` is the only source of truth for schema. Update it before touching the database.
2. `framework/agents/` is the source of truth for agent behavior. Campaign prompts are derived — never remove load-bearing directives.
3. `pipeline/nodes/campaigns.json` is the only source of truth for search arrays. Never hardcode in n8n nodes.
4. Never use `pipeline_admin` for runtime connections. Use `fleet_app`.
5. Never use Gemini CLI for database operations. Use `gcloud sql connect` via Cloud Shell.
6. Every prompt change stages in `campaign_staging_area.md` and tests in Agent Studio before going live.
7. `SHIPWRECKED` leads write to `fleet_errors`, never halt the workflow.
8. Session IDs are deterministic: `={{ 'lead_' + ($json.domain || $json.Company_Name).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() }}`
9. Never push `pipeline/` to a public repo. `framework/` only.
10. Agent files are always current. Pair programming files are allowed to be historical.
