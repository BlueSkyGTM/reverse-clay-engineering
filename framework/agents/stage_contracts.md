# Stage Contracts  Agent Input/Output Specifications

Each agent in the pipeline has a formal contract: what it receives, what it produces, and what the next stage expects. Campaign variants must honor these contracts. Ahab is optional  if your lead source is a pre-built list, start at the Nemo contract.

---

## Ahab  Nemo Handoff

**Ahab is optional.** Use Ahab when leads are discovered live. Skip Ahab when your campaign uses a staging table or pre-sourced list  Nemo accepts any structured input that satisfies its contract.

### Ahab outputs (one object per lead):
```json
{
  "Company_Name": "string  required",
  "Job_URL": "string  raw listing or career page URL",
  "Location_Status": "string  compliance against global_filters",
  "Raw_Primary_Signals": ["array of short keyword strings"],
  "Raw_Health_Signals": ["array of short keyword strings"]
}
```

### What Nemo expects at minimum:
```json
{
  "Company_Name": "string  required",
  "source_url": "string  any URL or signal pointing to the company (job listing, website, staging row)"
}
```

**If Ahab is skipped:** the staging table row replaces the Ahab payload. Nemo reads Company_Name + any available fields (email, phone, Products column, etc.) from the staging row directly. The contract is satisfied as long as Company_Name and at least one signal field are present.

---

## Nemo  Neptune Handoff

Neptune only runs if Nemo returns `status: ENRICHED`. SHIPWRECKED leads go to `fleet_errors` and are skipped.

### Nemo outputs (Enriched_Lead object):
```json
{
  "Company_Name": "string  required",
  "Target_Service_Intent": "string  must match a valid intent in campaign config",
  "Primary_Stack": ["array of strings  tools or products identified"],
  "Tech_Proof_URL": "string  URL proving tech stack or operational context",
  "funding_signal": "string or null  growth/funding context if found",
  "Contact_Recon": "string  decision-maker email pattern or LinkedIn URL"
}
```

### What Neptune expects:
```json
{
  "Company_Name": "string  required",
  "Target_Service_Intent": "string  required, drives the authority frame",
  "friction_type": "string  from Forensic Dictionary (API Stutter / Scale Friction / Manual Data Debt / Displacement Signal)",
  "Primary_Stack": ["array  referenced in the outreach if relevant"],
  "funding_signal": "string or null  if present, opens the Bite; if null, omit entirely",
  "Contact_Recon": "string  not used in copy, but passed through to output table"
}
```

**Neptune does not receive raw Ahab output.** It only receives Nemo's structured Enriched_Lead. If you bypass Nemo, Neptune will not have enough signal to write effective copy.

---

## Neptune  Database

Neptune writes one field: `Outreach_Bite` (string, 3-4 sentences).

### Full row written to output table:
| Field | Source |
|---|---|
| `Company_Name` | Nemo |
| `Direct_URL` | Nemo (`Tech_Proof_URL`) |
| `Target_Service_Intent` | Nemo |
| `Outreach_Bite` | Neptune |
| `Contact_Recon` | Nemo |
| `funding_signal` | Nemo |
| `Status` | Set by workflow node (default: `Enriched`) |
| `reviewed` | Default: `false`  set by human in NocoDB |
| `outreach_date` | Default: `null`  set by human after sending |

---

## Substitution Rules

| You want to skip... | You can, if... |
|---|---|
| Ahab | You supply Company_Name + at least one signal field per lead |
| Nemo | You already have a fully structured Enriched_Lead  all fields above present |
| Neptune | You are writing outreach outside the pipeline (e.g., manually via Clay output) |
| Clay | Nemo output is complete  Clay enriches further but is not required for the pipeline to write a row |

**You cannot skip Neptune and still get an Outreach_Bite.** Neptune is the only node that writes copy.

---

## Campaign Variant Checklist

When creating a new campaign variant, verify:
- [ ] Ahab variant: does it output `Company_Name`, `source_url`, and relevant signals?
- [ ] Nemo variant: does its `Target_Service_Intent` enum match the campaign config intents?
- [ ] Neptune variant: does its `Service_Intent_Pivot` cover every intent the campaign defines?
- [ ] Output table: does it have all required columns from the Neptune  Database contract above?
- [ ] Exclusion table: is it set in campaign config so Ahab (or the staging query) skips already-processed leads?
