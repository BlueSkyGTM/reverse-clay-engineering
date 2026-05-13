# Reverse Engineering Clay

A technical reconstruction of Clay-style GTM enrichment logic, built on a shoestring budget to understand how AI-assisted enrichment systems manage discovery, structured context, staged handoffs, failure states, and final payload generation.

This repository is not a production outbound platform. It is an architecture record: what had to exist for a Clay-like enrichment workflow to survive real row-level ambiguity, model drift, n8n payload limits, job-board noise, contact/research handoff failures, and schema instability.

## Core Thesis

Generic enrichment answers are cheap. Durable enrichment is harder.

The important idea this project uncovered is that enrichment quality improves when the table becomes a shared context surface. Each stage writes a small, durable payload that later stages can inherit instead of starting over from raw context.

In other words:

```text
Clay columns are not just lookups.
They can be memory-bearing handoffs.
```

The server-era system used Postgres for that shared context surface. Clay can use the table itself.

## What This Project Proved

The original system used Google Cloud, n8n, Postgres, and Gemini as a runtime lab. That runtime is no longer the product. It was the test bench that made the important design patterns visible:

- A lead workflow needs stage contracts, not one giant prompt.
- A workflow tool should not carry heavy AI payloads between every step.
- Grounded search is useful for discovery, but it needs filters that protect against job-board aggregators.
- AI output needs strict contracts, fallback behavior, and failure visibility.
- Later enrichments are more useful when they inherit the last stage's structured judgment.
- The final value is not "send outbound." The value is a trustworthy GTM payload that can move into Clay, HubSpot, or a sequencing tool with clean state.

## System Overview

The server-era pipeline had three stages:

```text
Discovery -> Diagnostic Enrichment -> Final Payload
```

The infrastructure around those stages was:

```text
Cloud Scheduler -> n8n -> fleet-agents API -> Postgres -> Retool
```

n8n was intentionally reduced to traffic control. It triggered the workflow and passed stable identifiers. The server and database handled the actual enrichment state.

## Core Architecture Decision: Pull Model

The first version pushed full payloads through n8n. That failed because every node carried too much context: source URLs, company notes, research strings, model logs, contacts, health signals, and partial output fields. Payloads grew, expressions broke, and downstream model calls received polluted context.

The fix was a pull model:

```text
Discovery writes payload to Postgres
n8n passes session_id
Enrichment reads by session_id and writes structured payload
n8n passes session_id
Final render reads by session_id and writes final output
```

This reduced handoffs to a stable key and made every stage independently inspectable.

## Discovery: Search Filtering

The discovery stage found companies with active GTM, RevOps, MarOps, or automation signals.

Important behaviors:

- Used Gemini with Google Search grounding to reach live web evidence.
- Searched from role and campaign instructions rather than a static lead list.
- Used job-posting search patterns to reach company career pages and relevant openings.
- Filtered job-board aggregators such as Indeed, LinkedIn Jobs, Glassdoor, Jobgether, Jobsora, and ZipRecruiter.
- Generated deterministic `session_id` values from company names.
- Wrote one row per company to Postgres with `status = 'Scraped'`.

The useful insight is not that this was a crawler. It was not. The insight is that grounded search plus strict company filtering can turn noisy public hiring surfaces into structured GTM inputs.

Relevant files:

- `system_files/src/agents/ahab.js`
- `agent_framework/prompts/ahab_system.yaml`
- `n8n_pipelines/WORKFLOW_BUILDER.md`

## Diagnostic Enrichment

The enrichment stage read a stored discovery payload and produced a structured enrichment object.

The important work was forensic, not generic enrichment. It classified operational friction into reusable categories:

| Friction type | Meaning |
|---------------|---------|
| `API Stutter` | Tools exist but do not communicate cleanly |
| `Scale Friction` | Growth is outpacing operational infrastructure |
| `Manual Data Debt` | Humans are doing work that should be automated |
| `Displacement Signal` | A company is paying for a tool or role that points to a better system-level fix |

It also handled disqualification. If a funding or growth signal was stale, the row could be marked `Shipwrecked` instead of being pushed forward as a false positive.

Relevant files:

- `system_files/src/agents/nemo.js`
- `agent_framework/prompts/nemo_system.yaml`
- `system_files/src/utils/parser.js`
- `system_files/src/utils/parser.py`

## Parser Layer: Why It Mattered

The parser layer was the practical bridge between n8n, model output, and server code.

`parser.py` normalized n8n payloads into a smaller shape the server could reliably process:

```json
{
  "session_id": "lead_example_company",
  "company_name": "Example Company",
  "email": null,
  "friction_type": "API Stutter"
}
```

`parser.js` handled runtime cleanup:

- Stripped citation markers such as `[1]` and `[2, 3]`.
- Rejected Vertex AI grounding redirect URLs.
- Extracted valid JSON from markdown-wrapped model output.
- Located friction and funding signals across inconsistent model output paths.
- Normalized contact payloads without corrupting JSONB.

The parser layer is why the experiment became useful: it exposed the gap between "the model produced something" and "the workflow can safely use it."

## Final Payload Synthesis

The final render stage read the enriched record and produced the final handoff payload.

The important lesson was not copywriting automation. Clay is not the outbound tool, and this repo should not be read as "Clay sends cold email." The useful pattern is that a final render stage should receive a narrow, validated brief rather than the full research context.

This stage tested:

- Whether a compact structured payload could generate specific human-facing language.
- Whether funding, friction type, contact context, and service intent were enough to produce a useful next-step payload.
- Whether schema-like output contracts reduced drift.

Relevant files:

- `system_files/src/agents/neptune.js`
- `agent_framework/prompts/neptune_system.yaml`
- `agent_framework/agents/stage_contracts.md`

## Stage Contracts

The stage-contract document is the spine of the project. It defines what each stage must receive, what it must produce, and what the next stage can assume.

This matters because agent workflows fail when every step receives "everything." Stage contracts force each stage to expose only the fields downstream work needs.

Key contract ideas:

- Discovery can be skipped if a pre-sourced list satisfies the enrichment minimum input.
- Enrichment must produce a structured `Enriched_Lead`.
- The final render stage should not receive raw discovery output.
- A deterministic handoff layer can strip full enrichment into a minimal brief.

Relevant file:

- `agent_framework/agents/stage_contracts.md`

## n8n's Role

n8n was deliberately not the intelligence layer.

Its job:

- Trigger the workflow.
- Send the campaign message or seed list.
- Parse returned `session_id` values.
- Call the next stages with only `session_id`.

Its non-job:

- Carry full lead payloads.
- Transform model outputs.
- Hold business logic.
- Decide enrichment strategy.

That division is what made the later Clay-native idea possible. If n8n can be reduced to handoffs, Clay columns can become the handoffs.

Relevant files:

- `n8n_pipelines/WORKFLOW_BUILDER.md`
- `n8n_pipelines/WORKFLOW_USAGE.md`

## Failure Modes That Shaped the System

The project is useful because failures were documented, not hidden.

Important fixes included:

- Aggregator companies being mistaken for target accounts.
- Vertex AI redirect URLs being stored instead of real company domains.
- Model citations polluting string fields.
- Contact JSON being stored incorrectly inside JSONB.
- Enriched rows being reset to `Scraped` on reruns.
- Stale leads briefly appearing alive.
- Model truncation creating empty final output.
- Stage failures being invisible without `fleet_errors`.

Relevant file:

- `system_files/CHANGELOG.md`

## Why This Points Back To Clay

The server proved the contracts. Clay is the natural operating surface.

The future version does not need Cloud Run, Postgres, or n8n as the center. It needs:

- Clay tables with stable identifiers.
- One job per AI column.
- Waterfall enrichment with cost gates.
- Forensic signal columns.
- A compact handoff column.
- A final payload/render column.
- HubSpot-ready export fields and QA gates.

That design is documented in:

- `CLAY_PLAYBOOK.md`

## Reviewer Path

If you are reviewing this project for a RevOps, MarOps, GTM Ops, or Automation role, read in this order:

1. `README.md` -- architecture story and why it matters.
2. `agent_framework/agents/stage_contracts.md` -- input/output contracts.
3. `system_files/src/utils/parser.py` -- n8n-to-server normalization.
4. `system_files/src/utils/parser.js` -- cleanup and extraction layer.
5. `system_files/src/agents/ahab.js` -- grounded discovery and aggregator filtering.
6. `system_files/src/agents/nemo.js` -- enrichment stage.
7. `system_files/src/agents/neptune.js` -- final synthesis stage.
8. `CLAY_PLAYBOOK.md` -- future Clay-native translation.

## Role Fit

This project is relevant to entry/junior:

- RevOps
- MarOps
- Marketing Automation
- GTM Ops
- Clay operator / Clay builder
- Automation Specialist

It is not positioned as a software engineering portfolio first. The code exists to prove systems thinking: clean handoffs, CRM-ready payloads, enrichment discipline, context control, and operational QA.
