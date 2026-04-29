# INSTRUCTIONS.md — friction-pipeline

## Starting a Session

1. Read `STATE.md` — current infrastructure status and pickup point
2. Read `CLAUDE.md` — routing table and campaign registry
3. Check `DECISIONS.md` — locked decisions, do not re-litigate
4. Confirm intent, then act

Use `/pipeline run`, `/pipeline fix`, `/pipeline new`, `/pipeline status`, or `/save` — do not freestyle outside these modes.

## Mode Reference

| Intent | Command | What it loads |
|---|---|---|
| Execute a campaign | `/pipeline run {campaign}` | agent_platform_call.md + prompt_library + agent base YAMLs |
| Debug a workflow | `/pipeline fix` | STATE.md + schema_map.sql + workflow.json |
| Add a campaign | `/pipeline new {campaign}` | new_campaign.md |
| Check infrastructure | `/pipeline status` | STATE.md infrastructure table only |
| Close session | `/save` | Writes Pickup Point to STATE.md |

## Building Workflows

Reference: `framework/api/agent_platform_call.md` — endpoints, request bodies, response parsing, pre-Ahab dedup pattern.

Node versions: `STATE.md` → Node Version Reference. Use exact typeVersions or the workflow breaks on import.

Agents are hosted on Agent Platform with system prompts baked in. n8n HTTP Request nodes send user-turn content only — no `systemInstruction` in the request body.

## Prompt Changes

Stage all prompt changes in `pipeline/prompts/campaign_staging_area.md` before touching any live file. Test in Agent Platform AI Studio. Promote only after Ray approves.

## Infrastructure Commands

Write the command. Ray runs it. No exceptions. See `STATE.md` → CLI Protocol.

## Closing a Session

Run `/save` before ending. It writes the Pickup Point to STATE.md so the next agent orients correctly.
