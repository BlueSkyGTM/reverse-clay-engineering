# STATE.md — Current Pipeline Truth
**Updated:** 2026-04-28 (session 3)
**Rule:** This file changes every session. CLAUDE.md does not. If something is stale here, update it before acting on it.

---

## Infrastructure Status

| Component | Status | Notes |
|---|---|---|
| `ocean-db-cluster` | Live | PostgreSQL 15, private IP 10.5.1.3, Direct VPC Egress |
| `n8n-orchestrator` | Live | min-instances=1, always warm, CPU throttling disabled |
| `n8n-worker` | Live | min-instances=0, sleeps between runs |
| `nocodb_data` schema | Current | 6 campaign tables + 3 fleet tables. Email column added 2026-04-27 |
| Retool | Built | blueskygmt.retool.com — 9 pages, all queries wired |
| Cloud Scheduler | Not configured | Required before workflows fire nightly |
| All 6 workflows | Superseded | Old LangChain architecture. V4 HTTP Request build pending. |
| Agent Platform credential | Not wired in n8n | Must be wired before any workflow calls Agent Platform |

---

## Architecture Decision (2026-04-27)

Workflows rebuilt around direct Agent Platform HTTP Request calls. No LangChain nodes — they don't support native Google Search grounding, causing Ahab to hallucinate leads.

**New stack:** HTTP Request nodes → Agent Platform generateContent endpoint. Auth = Google Service Account (ocean-pipeline-sa). Ahab uses `googleSearch` grounding in request body. Nemo and Neptune have no grounding — forensic reasoning only. responseSchema enforced in generationConfig on all three agents. Campaign specifics injected from `framework/prompt_library/` at runtime.

**API reference:** `framework/api/agent_platform_call.md`

---

## What's Left — Friction Pipeline

### Claude Code can build (next session)

- [ ] **V4 universal workflow JSON** — build the n8n HTTP Request workflow for all 6 campaigns using `framework/api/agent_platform_call.md`. Includes pre-Ahab dedup node, Ahab/Nemo/Neptune HTTP Request nodes, Splitter, SHIPWRECKED branch to `fleet_errors`, and final Postgres write. One reusable workflow template, then fork per campaign.
- [ ] **Populate `tracked_companies`** in `pipeline/nodes/campaigns.json` — add real company slugs for each career hunt campaign once targets are identified. Scanner is wired; it just needs the list.

### Manual — Ray only (cannot be automated)

These require a live n8n or GCP browser/CLI session:

1. **Wire Agent Platform credential** — rename "Vertex Fleet Key" to "Agent Platform Key" in n8n credential manager, confirm Google Service Account is correctly wired. Required before any workflow calls Agent Platform.
2. **Test in Agent Studio** — run Ahab with `framework/prompt_library/gtm_career_hunt.yaml`, verify Catch[] output. Then test Nemo with that output, watch for CATALYST_STALE. Then test Neptune, verify Rule of One and Outreach Bite quality.
3. **Import V4 workflow JSON** — once Claude builds the JSON, import it into n8n canvas via UI.
4. **Configure Cloud Scheduler** — run gcloud commands from `pipeline/infrastructure/sovereign_hub.md`. One job per campaign on its schedule.
5. **Activate Stage 4 webhook** — toggle Active in n8n UI after import.

### Integrated pipeline note

friction-pipeline and organic-pipeline are not sequential — they are two halves of the same loop. Neptune's Outreach Bite (outbound diagnosis) and the inbound website copy must speak the same language. If a Bite diagnoses Scale Friction and the landing page doesn't mirror that, the loop fails. organic-pipeline work runs concurrently with friction-pipeline, not after it. The Forensic Dictionary archetypes are the shared language between both.

### Future — after first live run

- [ ] GTM Career Hunt + Accountant Bulk run for 30 days → if clean, deploy remaining 4 campaigns via `/pipeline run` subagent
- [ ] Populate Learned Patterns in `framework/prompt_library/` and skill router as signal accumulates
- [ ] Use first live Neptune Bites to validate organic-pipeline copy — Bite language governs website messaging, not the other way around
- [ ] Rename working directory (remove `(FRP)` from folder name) — no path changes needed; all references are relative

---

## Session Insights (2026-04-27 session 2)

### Framework renamed: File-to-Revenue-Pipes (FRP)
Evolution of File-to-Pipe Engineering. Same methodology, explicit revenue focus, designed to house multiple pipelines under one mission control.

### Mission control architecture
This repo becomes the brain stem. Head (Claude Code) operates at abstraction level — strategic decisions, prompt design, architecture calls. Subagents are dispatched for contained execution tasks. n8n handles autonomous scheduled runs. The file system is the shared memory layer between all three. Multiple pipelines (NocoDB fleet, AI SEO, Claude Design) converge here once each is proven independently.

### Skill router as middleware (from career-ops repo)
`.claude/skills/` is not just a context shortcut for the head — it is protocol middleware that subagents can also read on cold start to self-orient and execute without hand-holding. The files carry the context so Ray's directives can be short and the head stays at abstraction.

### Synapse_CoR feedback loop
Professor Synapse (ProfSynapse/Professor-Synapse) solved the head-body reporting problem: subagents report back through structured pattern files, not just chat responses. Adopted for FRP as: subagents write structured output to STATE.md and the two-tier pattern library after each execution. The `/pipeline save` skill closes this loop automatically.

### What we are taking from Synapse
1. CONTEXT/MISSION/INSTRUCTIONS/GUIDELINES agent template — cleaner briefing structure than current campaign prompts
2. Two-tier pattern library — global (skill router) + campaign-specific (`framework/prompt_library/`) with subagent write-back
3. `/pipeline save` as the mechanism that auto-updates STATE.md pickup point
- NOT taking: chatbot persona, emoji conductor, emotional alignment steps — those are chat-optimized, not file-optimized

### What we are taking from career-ops repo
**Repo:** https://github.com/santifer/career-ops
1. Skill router dispatch pattern — one file routes intent to targeted context load, not full repo load every session
2. DATA_CONTRACT.md — explicit system vs user layer split, critical before `framework/` goes public on GitHub
3. Zero-token ATS pre-scanner — Greenhouse/Ashby/Lever APIs hit directly before Ahab runs; Ahab's grounding budget goes toward net-new discovery only
4. Dedup store pattern — pre-Ahab Code node queries Postgres for known companies, builds Excluded_Companies list in real time. No manual maintenance.
- NOT taking: offer scoring, PDF generation, interview prep, multi-language modes — job seeker features with no pipeline analogue

### Session alignment on concurrent pipelines
AI SEO and Claude Design are separate repos currently. Once this pipeline is stable and `framework/` is clean, merging them into mission control is a file organization task. Prerequisite: those repos must follow the same file conventions (STATE.md, DECISIONS.md, campaign directories, prompts separated from configs) before merging or the merge becomes a refactor.

### Cross-repo session limitation
Claude Code is scoped to one working directory per session. Cross-repo reads can use `gh api` (GitHub) or absolute paths (same machine). Not a blocker for integration — just requires opening mission control repo as the working directory when doing the merge.

---

## Pickup Point
**Updated:** 2026-04-28
**Session:** Session 4 — full 6-file context layer, reply handlers, signal layer, workspace structure locked across all pipelines

### Completed This Session
- `CONTEXT.md`, `MISSION.md`, `INSTRUCTIONS.md`, `GUIDELINES.md`, `REFERENCES.md` — full context layer built for friction-pipeline (was missing)
- `campaigns/gtm_reply_handler/config.yaml` — reply handler config (INTERESTED → booking, NEEDS_MORE_INFO → Neptune follow-up, NOT_INTERESTED → fleet_errors)
- `campaigns/accountant_reply_handler/config.yaml` — same pattern, accountant domain
- `campaigns/researcher_reply_handler/config.yaml` — same pattern, researcher domain
- `pipeline/signals/signal_config.yaml` — signal layer: 6 campaign tables, reply log mapping, 5 metrics
- `pipeline/signals/pattern_query.sql` — 4 queries: friction type distribution, reply rate, shipwreck rate, CATALYST_STALE rate
- `pipeline/signals/pattern_writer.mjs` — reads config, queries Postgres (fleet_app), writes draft to output/ — does NOT auto-promote to prompt_library
- `SKILL.md` — Subagent Dispatch Protocol added; /pipeline save removed, redirected to /save
- FRP root: universal `/save` skill created at `.claude/skills/save/SKILL.md`
- FRP root: `GUIDELINES.md` workspace creation standard locked (6-file requirement)
- organic-pipeline: `STATE.md`, `DECISIONS.md` created; `forensic_map.md` built; `CLAUDE.md` + `REFERENCES.md` updated; orphaned `claude_workspace` deleted

### Next Steps
1. **Claude Code:** Build V4 workflow JSON — Steps 1-3 in `NEXT_SESSION_HANDOFF.md`. Gates everything downstream.
2. **Claude Code:** Create `pipeline/data/raymond_fenton_profile.yaml` — Raymond Fenton candidate profile as runtime data (not in system prompts)
3. **Claude Code:** Stage Neptune rewrite in `campaign_staging_area.md` — 4-part email formula + Viking Velociraptor social proof
4. **Claude Code:** Add `Job_Intent` field to Ahab Catch[] schema
5. **Ray (manual):** Rename "Vertex Fleet Key" → "Agent Platform Key" in n8n UI, wire credential
6. **Ray (manual):** Decide Raymond Fenton personal site offer + FRP Landing Page anchor campaign
7. **Ray (manual):** Initialize git at FRP root to cover organic-pipeline (currently untracked)

### Blockers
- Agent Platform credential must be wired in n8n UI before any workflow can call Agent Platform
- raymond-fenton site offer and frp-landing anchor campaign are Ray decisions — cannot wireframe until decided

---

## CLI Protocol (NEVER skip this)

Every CLI prompt must follow this exact structure:

1. **Fresh session declaration** — begin every prompt with "This is a fresh session."
2. **Step number** — "Step 1 of X:" so the agent knows its scope
3. **Context block** — before the command, explain why we are running it: what problem we are solving, what we already tried, and what we expect this command to do
4. **Single task only** — one command, one purpose
5. **Diagnostic report** — always ask CLI to provide a brief diagnostic report summarizing what the output means
6. **Loop limit** — include explicitly: "If this command fails, report the error and stop. Do not attempt alternative approaches, variations, or retries. One attempt only."
7. **Report and stop** — end every prompt with "Report the output and the diagnostic summary, then stop. Do not attempt to fix, modify, or run any follow-up commands."

Example format:
```
This is a fresh session. Step 1 of 1: Run the following command and report the output. Also provide a brief diagnostic report summarizing what the output means.

Context: [explain the problem, what was already tried, and why this specific command is the next step]

[command here]

Report the output and the diagnostic summary, then stop. Do not attempt to fix, modify, or run any follow-up commands.
```

**Why this matters:** CLI has enough access to delete the entire infrastructure. An agent that sees an error and tries to fix it autonomously can cause irreversible damage. Claude writes the command. Ray runs it. Ray pastes the output back. No exceptions.

**CRITICAL — `--set-env-vars` replaces ALL env vars, it does not append.** Every update command must include every existing variable or they are silently wiped. Always pull current env vars first (`gcloud run revisions describe`) before writing an update command.

**Service definition YAML:** For multi-container deployments use `gcloud run services replace` with `pipeline/infrastructure/n8n_orchestrator_service.yaml`. Never use `gcloud run services update` with flags — it silently drops vars not included. The YAML is the single source of truth.

---

## Node Version Reference (verified 2026-04-27)

Applies to any legacy workflow JSON being patched. V4 will not use these node types.

| Node type | typeVersion | Notes |
|---|---|---|
| `@n8n/n8n-nodes-langchain.agent` | 1.7 | Tools Agent mode. No "agent" dropdown or parameter. |
| `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` | 1 | No change needed. |
| `@n8n/n8n-nodes-langchain.memoryPostgresChat` | 1.3 | Was 1 in old workflows. |
| `n8n-nodes-base.set` | 3.4 | Was 3 in old workflows. |
| `n8n-nodes-base.itemLists` | 3.1 | Was 3 in old workflows. |
| `n8n-nodes-base.postgres` | 2.6 | Was 2 in old workflows. |
| `n8n-nodes-base.code` | 2 | Correct. |
| `n8n-nodes-base.manualTrigger` | 1 | Correct. |
| `n8n-nodes-base.if` | 2 | Correct. |
