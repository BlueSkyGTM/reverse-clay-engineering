# File-to-Revenue-Pipeline (FRP)

A three-agent AI pipeline for nightly lead discovery, forensic enrichment, and outreach synthesis. Built on Gemini Enterprise Agent Platform, orchestrated by n8n, with Postgres as the sovereign data layer.

The framework is domain-agnostic. The same three agents run every campaign. Only the prompt library changes.

---

## The Core Insight

Every domain we target has the same four underlying data problems:

| Friction | What It Looks Like |
|---|---|
| **API Stutter** | Tools exist but don't talk to each other. Data moves by hand. |
| **Scale Friction** | Growth is outpacing the data infrastructure built to support it. |
| **Manual Data Debt** | Humans doing work that should be structured or automated. |
| **Displacement Signal** | Paying a platform or generalist for something a specialist does better. |

The pipeline identifies which friction is present, names it precisely, and writes outreach that enters the prospect's existing mental conversation about it. One sentence that sounds like you've been in their office beats a thousand generic cold emails.

---

## Agent Architecture

```
Ahab  ->  Nemo  ->  Neptune
Find      Enrich    Write
```

| Agent | Model | Job | Grounding | Temp |
|---|---|---|---|---|
| **Ahab** | Gemini 2.5 Flash | High-volume discovery — scrapes job boards, Upwork, org sites for friction signals | ON (googleSearch) | 0.0 |
| **Nemo** | Gemini 2.5 Pro | Forensic enrichment — applies Forensic Dictionary, sources every claim, finds the decision maker | OFF | 0.0 |
| **Neptune** | Gemini 2.5 Pro | Outreach synthesis — Robert Collier-style Bite, 3-4 sentences, first-person, one peer suggestion | OFF | 0.7 |

Ahab is optional. Campaigns with a pre-sourced staging table skip directly to Nemo.

All three agents call the Gemini Enterprise Agent Platform REST API directly via HTTP Request nodes. No LangChain. No middleware model layer. Campaign specifics are injected from the prompt library at runtime — the workflow nodes themselves are universal.

---

## Active Campaigns

| Campaign | Domain | Channel | Output Table | Schedule |
|---|---|---|---|---|
| GTM Career Hunt | GTM | ATS job boards | `gtm_career_leads` | Daily 2AM |
| GTM Upwork Hunt | GTM | Upwork | `gtm_upwork_leads` | Daily 6AM |
| Accountant Career Hunt | Accounting | ATS job boards | `accountant_career_leads` | Daily 4AM |
| Accountant Bulk Enrichment | Accounting | Staging table | `accountant_bulk_leads` | Weekly Mon 3AM |
| Accountant Upwork Hunt | Accounting | Upwork | `accountant_upwork_leads` | Daily 7AM |
| Researcher Career Hunt | Research | ATS + org boards | `researcher_career_leads` | Daily 2:30AM |

---

## Why Data-Driven Domains

GTM engineers, bookkeepers, and research analysts all operate at the intersection of data collection, storage, and analysis. The friction they create — and the friction organizations have finding them — maps identically to the same four archetypes.

This is not a coincidence. It is a targeting strategy.

- A RevOps team with a broken HubSpot sync has **API Stutter**
- An SMB on QBO Advanced with no one running reconciliation has **Displacement Signal**
- A research lab hand-coding exports into Excel before every grant report has **Manual Data Debt**

Nemo doesn't know which domain it's in until it reads the domain evidence block. The reasoning is identical. Only the vocabulary changes.

---

## Repo Structure

```
framework/                       publishable core — safe to share
   agents/
      ahab_base.yaml            Ahab source of truth + grounding config
      nemo_base.yaml            Nemo source of truth + Forensic Dictionary
      neptune_base.yaml         Neptune source of truth + Rule of One
      stage_contracts.md        formal input/output contracts between agents
   prompt_library/
      {campaign_name}.yaml      campaign-specific prompt injections (ICP, signals, framing)
      README.md                 how the two-layer architecture works
   api/
      agent_platform_call.md    Agent Platform API reference for all three agents
   schema/
      campaign_template.sql     template for new campaign tables
   setup/
      new_campaign.md           how to add a new campaign

campaigns/                       private — one directory per campaign
   {campaign_name}/
      config.yaml               source, signals, schedule, output table
      ahab_prompt.yaml          derived from ahab_base + prompt library
      nemo_prompt.yaml          derived from nemo_base + domain evidence
      neptune_prompt.yaml       derived from neptune_base + authority frame
      workflow.json             live n8n export (backup)

pipeline/                        sovereign infrastructure — never publish
   infrastructure/
      sovereign_hub.md          credentials, URLs, IDs, safety rules
      table_guide.md            plain-English guide to every fleet table
      n8n_orchestrator_service.yaml  Cloud Run service definition (source of truth)
   memory/
      schema_map.sql            source of truth for all table definitions
   nodes/
      campaigns.json            runtime search arrays (never hardcode in n8n)
      library.json              n8n node templates

.claude/skills/                  session middleware
   pipeline/SKILL.md            skill router — dispatches session intent, orients subagents

personal/                        not agent context, not published
```

---

## Infrastructure

| Component | Service | Notes |
|---|---|---|
| Orchestration | n8n on Cloud Run | `n8n-orchestrator` (min-instances=1) + `n8n-worker` (min-instances=0) |
| AI Inference | Gemini Enterprise Agent Platform | Gemini 2.5 Flash (Ahab) + 2.5 Pro (Nemo, Neptune) |
| Database | Cloud SQL `ocean-db-cluster` | PostgreSQL 15, private IP, Direct VPC Egress |
| Scheduling | Cloud Scheduler | One job per campaign — wakes n8n on cron |
| Review UI | Retool | Read-only Postgres connection, zero schema coupling |
| Auth | Google Service Account `ocean-pipeline-sa` | Agent Platform Key — used for all Agent Platform calls |

**Connection pattern:** Cloud Scheduler -> n8n (Cloud Run) -> Agent Platform REST API -> Postgres (private IP via Direct VPC Egress)

---

## Prompt Architecture

Base agents contain universal methodology. The prompt library contains campaign-specific ICP, signals, and framing. They never mix.

```
framework/agents/nemo_base.yaml
   [Forensic_Dictionary]              4 archetypes, identical across all campaigns
   [CATALYST_STALE]                   deprioritize leads with stale capital catalysts

        framework/prompt_library/{campaign}.yaml
           [Service_Intent_Lock]      locked to one domain per campaign
           [Domain_Evidence]          evidence vocabulary for each friction archetype
           [Contact_Recon_Target]     who the decision maker is for this campaign
```

If a campaign prompt drifts from the base, the base wins. Integrity rules are documented in each base file.

---

## Data Contract

`framework/` is the system layer — publishable, evolves with the methodology.
`pipeline/` and `campaigns/` are the user layer — private, contains live credentials and real infrastructure IDs.

Never push `pipeline/` or `campaigns/` to a public repo. See `DATA_CONTRACT.md` for the full split.

---

## Adding a New Campaign

See `framework/setup/new_campaign.md`. The framework is domain-agnostic — any data-driven organization with one of the four friction archetypes is a valid target.

---

## Infrastructure Rules

Full rules and incident log in `pipeline/infrastructure/sovereign_hub.md`. Short version:

- Never use `pipeline_admin` for runtime connections — use `fleet_app`
- Never use `--set-env-vars` without including every existing variable — Cloud Run silently drops what you omit
- Deploy n8n changes via `gcloud run services replace` with the YAML file — never flags
- Cloud SQL backups run at 03:00 UTC — 7-day PITR window
- Gemini CLI is banned from database operations — confirmed to explore directories autonomously
