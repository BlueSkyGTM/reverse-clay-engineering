# Prompt Library

One file per campaign. Each file is the campaign-specific layer injected at runtime into the agnostic base agents (Ahab, Nemo, Neptune).

The base agents contain the methodology, Forensic Dictionary, Rule of One, and response schemas.
The prompt library contains everything that changes between campaigns: who to find, what signals to look for, how to frame the service intent.

---

## Architecture

```
framework/agents/ahab_base.yaml     <-- universal behavior, never changes
framework/agents/nemo_base.yaml     <-- universal enrichment logic, never changes
framework/agents/neptune_base.yaml  <-- universal copy rules, never changes

framework/prompt_library/           <-- campaign-specific layer injected at runtime
  gtm_career_hunt.yaml
  gtm_upwork_hunt.yaml
  accountant_career_hunt.yaml
  accountant_bulk_enrichment.yaml
  accountant_upwork_hunt.yaml
  researcher_career_hunt.yaml
```

## What Goes in a Prompt Library File

Each file covers three sections -- one per agent:

### Ahab section
- Campaign type label (what kind of opportunity is being hunted)
- Target profiles (roles, companies, platforms depending on campaign)
- Tech/signal keywords to prioritize
- Source channels (job boards, Upwork, LinkedIn, etc.)
- Global filters (remote only, active listings only, etc.)
- Excluded companies list placeholder

### Nemo section
- Service intent lock (which intent this campaign routes to -- GTM, Accounting, Research)
- Domain evidence translations (what API Stutter, Scale Friction, Manual Data Debt, Displacement Signal look like in this domain)
- Decision-maker framing (who the contact target is for this campaign)

### Neptune section
- Authority frame (what domain expertise to lead with)
- Tone notes if different from base (researcher campaigns use intellectual peer tone vs. sales peer tone)

## Rules
- Never put methodology in a prompt library file. That lives in the base agents.
- Never put response schema in a prompt library file. Schema is locked in base agents.
- If a campaign needs a new friction type or intent, add it to the base first, then reference it here.
- Prompt library files are injected as the user-turn message to the agent, not the system instruction.
