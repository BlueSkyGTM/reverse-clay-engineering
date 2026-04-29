# REFERENCES.md — friction-pipeline

## Agent Files

| File | Purpose |
|---|---|
| `framework/agents/ahab_base.yaml` | Ahab system prompt — search, grounding, Catch[] schema |
| `framework/agents/nemo_base.yaml` | Nemo system prompt — Forensic Dictionary, CATALYST_STALE, Email field |
| `framework/agents/neptune_base.yaml` | Neptune system prompt — Rule of One, Collier synthesis, 0.7 temp |
| `framework/agents/stage_contracts.md` | Formal I/O contracts between agents |

## API + Workflow

| File | Purpose |
|---|---|
| `framework/api/agent_platform_call.md` | Agent Platform endpoints, request bodies, response parsing, pre-Ahab dedup |
| `campaigns/{name}/workflow.json` | n8n workflow per campaign |
| `campaigns/{name}/config.yaml` | Campaign config — ICP, signals, schedule, output table |

## Prompt Library

| File | Purpose |
|---|---|
| `framework/prompt_library/{campaign}.yaml` | Campaign-specific prompt injections — aims the agents |
| `pipeline/prompts/campaign_staging_area.md` | Stage prompt changes here before promoting to live files |

## Infrastructure

| File | Purpose |
|---|---|
| `pipeline/infrastructure/sovereign_hub.md` | Credentials, URLs, GCP project ID, n8n API keys |
| `pipeline/memory/schema_map.sql` | Live schema — source of truth for all tables |
| `pipeline/infrastructure/n8n_orchestrator_service.yaml` | Cloud Run service definition |
| `pipeline/nodes/campaigns.json` | Search arrays — source of truth, never hardcode in n8n |
| `pipeline/nodes/scanner.mjs` | Zero-token ATS pre-scanner (Greenhouse/Ashby/Lever) |
| `pipeline/signals/` | Signal layer — pattern_query.sql, pattern_writer.mjs, signal_config.yaml |

## Reply Handlers

| File | Purpose |
|---|---|
| `campaigns/gtm_reply_handler/config.yaml` | Inbound reply routing for GTM campaigns |
| `campaigns/accountant_reply_handler/config.yaml` | Inbound reply routing for accountant campaigns |
| `campaigns/researcher_reply_handler/config.yaml` | Inbound reply routing for researcher campaigns |

## Session State

| File | Purpose |
|---|---|
| `STATE.md` | Live infrastructure status + Pickup Point — read first every session |
| `DECISIONS.md` | Locked architecture decisions — do not re-litigate |
