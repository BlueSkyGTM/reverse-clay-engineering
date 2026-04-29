# Setup Mode  New Campaign Initialization

Run this checklist with Claude at the start of every new campaign. Answer each question and Claude will generate the campaign config, agent variants, schema amendment, and workflow stub.

---

## Intake Questions

**1. Campaign identity**
- What is the campaign name? (used as the directory name and n8n workflow label)
- What is the target audience in one sentence?

**2. Lead source**
- Does Ahab discover leads live, or do you supply a pre-sourced list?
  - `ahab_discovery`  Ahab runs nightly, requires search config
  - `staging_table`  you import a CSV, Ahab is not used

**3. If Ahab-driven:**
- What are the target roles or company profiles Ahab should search for?
- What tech stack or tool signals indicate a qualified lead?
- What source channels should Ahab prioritize? (job boards, platform listings, news, etc.)
- What global filters apply? (e.g., remote only, US only, SMB only)

**4. If staging-table-driven:**
- What columns does your source data have?
- Which column carries the primary qualification signal? (e.g., Products, subscription tier, job title)
- What does that signal mean for the outreach angle?

**5. Service intent**
- What is the service being offered? (maps to Target_Service_Intent in Nemo/Neptune)
- What friction or displacement signal does Nemo look for?
- What authority frame does Neptune write from?

**6. Output**
- What is the output table name?
- What is the staging table name (if applicable)?
- What schedule should the workflow run on?

**7. Exclusions**
- Which table holds already-processed leads to exclude from future runs?

---

## What Claude generates

Once you answer the above, Claude produces:

1. **`campaigns/{campaign_name}/config.yaml`**  campaign configuration file
2. **Agent prompt variants**  Ahab, Nemo, and/or Neptune variants in `campaigns/{campaign_name}/`
3. **Schema amendment**  SQL to add the new output table (and staging table if needed)
4. **n8n workflow stub**  pre-wired to the campaign config, ready to import

Existing campaigns and their prompts are never modified. Each campaign is an independent instance.

---

## Design Principles

- **Agents are tool-agnostic.** The baseline agents (Ahab, Nemo, Neptune) work with any LLM that supports JSON mode and grounding/search. n8n and Agent Platform are the current runtime  not requirements.
- **Ahab is optional.** If you have a pre-sourced list, skip Ahab entirely. Nemo works from any structured input.
- **Nemo is Clay-ready by design.** Every Nemo output is structured for downstream enrichment via Clay or equivalent. The enrichment is usable even if Clay never runs.
- **Neptune is a pure copywriter.** Never give it data engineering tasks. Pass it a clean, fully structured Nemo output and let it write.
- **Campaigns don't share prompts.** Each campaign gets its own agent variant files. The baselines are never modified.
