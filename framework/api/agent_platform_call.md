# Agent Platform API Call Reference
**Platform:** Gemini Enterprise Agent Platform  
**Auth:** Google Service Account (ocean-pipeline-sa)  
**Credential in n8n:** Agent Platform Key (Google Service Account API type)  
**GCP Project:** {GCP_PROJECT_ID}  
**Region:** us-central1  

---

## Endpoints

| Agent | Model | Endpoint |
|---|---|---|
| Ahab | gemini-2.5-flash | `https://aiplatform.googleapis.com/v1/projects/{GCP_PROJECT_ID}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent` |
| Nemo | gemini-2.5-pro | `https://aiplatform.googleapis.com/v1/projects/{GCP_PROJECT_ID}/locations/global/publishers/google/models/gemini-2.5-pro:generateContent` |
| Neptune | gemini-2.5-pro | `https://aiplatform.googleapis.com/v1/projects/{GCP_PROJECT_ID}/locations/global/publishers/google/models/gemini-2.5-pro:generateContent` |

---

## Request Structure

### Ahab (with Google Search grounding)

```json
{
  "systemInstruction": {
    "parts": [{ "text": "{{AHAB_BASE_SYSTEM_INSTRUCTION}}" }]
  },
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "{{CAMPAIGN_AHAB_PROMPT}}\n\nExcluded Companies: {{EXCLUDED_COMPANIES}}" }]
    }
  ],
  "tools": [
    {
      "googleSearch": {}
    }
  ],
  "generationConfig": {
    "temperature": 0.0,
    "maxOutputTokens": 16384,
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "properties": {
        "Harpooner_Logs": {
          "type": "array",
          "items": { "type": "string" }
        },
        "Catch": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "Company_Name": { "type": "string" },
              "Job_URL": { "type": "string" },
              "Location_Status": { "type": "string" },
              "Raw_Primary_Signals": { "type": "array", "items": { "type": "string" } },
              "Raw_Health_Signals": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["Company_Name", "Job_URL", "Location_Status"]
          }
        }
      },
      "required": ["Harpooner_Logs", "Catch"]
    }
  }
}
```

### Nemo (no grounding -- forensic enrichment only)

```json
{
  "systemInstruction": {
    "parts": [{ "text": "{{NEMO_BASE_SYSTEM_INSTRUCTION}}" }]
  },
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "{{CAMPAIGN_NEMO_PROMPT}}\n\nLead to enrich:\n{{AHAB_CATCH_ITEM_JSON}}" }]
    }
  ],
  "generationConfig": {
    "temperature": 0.0,
    "maxOutputTokens": 8192,
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "required": ["Nemo_Enrich_Audit", "Diver_Audits", "Enriched_Lead"],
      "properties": {
        "Nemo_Enrich_Audit": {
          "type": "object",
          "required": ["status", "reason_code", "grounding_citations"],
          "properties": {
            "status": { "type": "string", "enum": ["ENRICHED", "SHIPWRECKED"] },
            "reason_code": { "type": "string", "enum": ["SUCCESS", "404_STUTTER", "DATA_THIN", "CATALYST_STALE"] },
            "grounding_citations": { "type": "array", "items": { "type": "string" } }
          }
        },
        "Diver_Audits": {
          "type": "object",
          "required": ["url_recon_notes", "health_audit_notes", "friction_notes"],
          "properties": {
            "url_recon_notes": { "type": "string" },
            "health_audit_notes": { "type": "string" },
            "friction_notes": { "type": "string" }
          }
        },
        "Enriched_Lead": {
          "type": "object",
          "properties": {
            "Company_Name": { "type": "string" },
            "Target_Service_Intent": { "type": "string" },
            "Primary_Stack": { "type": "array", "items": { "type": "string" } },
            "Tech_Proof_URL": { "type": "string" },
            "funding_signal": { "type": "string" },
            "Contact_Recon": { "type": "string" },
            "Email": { "type": "string" }
          }
        }
      }
    }
  }
}
```

### Neptune (no grounding -- synthesis only)

```json
{
  "systemInstruction": {
    "parts": [{ "text": "{{NEPTUNE_BASE_SYSTEM_INSTRUCTION}}" }]
  },
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "{{CAMPAIGN_NEPTUNE_PROMPT}}\n\nFriction Profile:\n{{NEMO_OUTPUT_JSON}}" }]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 4096,
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "required": ["Neptune_Log", "Outreach_Bite"],
      "properties": {
        "Neptune_Log": {
          "type": "object",
          "properties": {
            "intent_recognized": { "type": "string" },
            "friction_strategy": { "type": "string" },
            "rule_of_one_check": { "type": "string" }
          }
        },
        "Outreach_Bite": { "type": "string" }
      }
    }
  }
}
```

---

## n8n HTTP Request Node Configuration

- **Method:** POST
- **Authentication:** Predefined Credential Type > Google Service Account API > Agent Platform Key
- **Headers:** Content-Type: application/json
- **Body:** JSON (paste the relevant request structure above, with expressions substituted for {{placeholders}})

## Response Parsing

The model response wraps the JSON in:
```json
{
  "candidates": [
    {
      "content": {
        "parts": [{ "text": "...your JSON here..." }]
      }
    }
  ]
}
```

In n8n, extract with:
```
{{ JSON.parse($json.candidates[0].content.parts[0].text) }}
```

Or if responseMimeType is application/json, the response may come pre-parsed. Test on first run.

---

## Pre-Ahab Dedup Node Pattern

All V4 workflows must include a dedup node before the Ahab HTTP Request fires. This builds the `EXCLUDED_COMPANIES` list in real time from Postgres — no manual maintenance, no file system dependency.

### Node sequence (before Ahab)

```
Postgres Query Node → Code Node → Ahab HTTP Request
```

### Postgres Query Node

Query:
```sql
SELECT DISTINCT "Company_Name"
FROM {campaign_table}
WHERE "Company_Name" IS NOT NULL;
```

Replace `{campaign_table}` with the campaign's output table (e.g., `gtm_career_leads`).

- Connection: `fleet_app` credential (never `pipeline_admin`)
- Returns: array of `{ Company_Name: "string" }` objects

### Code Node

Takes the Postgres result and formats it as a comma-separated string for injection into Ahab's prompt:

```javascript
const rows = $input.all();
const companies = rows
  .map(r => r.json.Company_Name)
  .filter(Boolean)
  .join(', ');

return [{ json: { excluded_companies: companies || '' } }];
```

Output field: `excluded_companies` — referenced in Ahab's user-turn as `{{ $json.excluded_companies }}`.

### Ahab HTTP Request (injection point)

In the request body, the user-turn contents already have the placeholder:

```json
"text": "{{CAMPAIGN_AHAB_PROMPT}}\n\nExcluded Companies: {{EXCLUDED_COMPANIES}}"
```

Replace `{{EXCLUDED_COMPANIES}}` with the n8n expression:
```
={{ $('Code Node').item.json.excluded_companies }}
```

### Why Postgres, not a file

- Runs every time the workflow fires — reflects the actual current state of the output table
- No drift between the exclusion list and the database
- No manual step to update a file or array after each run
- Works across restarts and redeploys

### Also check `fleet_errors`

Optionally extend the query to also exclude known-bad leads:

```sql
SELECT DISTINCT "Company_Name"
FROM {campaign_table}
WHERE "Company_Name" IS NOT NULL
UNION
SELECT DISTINCT "Company_Name"
FROM fleet_errors
WHERE "Company_Name" IS NOT NULL
  AND resolved = false;
```

This prevents token spend on leads that already failed enrichment.

---

## Notes

- grounding tool key is `googleSearch` in REST API HTTP Request nodes. Do not use `google_search_retrieval` (Vertex AI SDK legacy key).
- Nemo and Neptune do not use grounding -- they reason over structured input, not live web data.
- All three agents use `responseMimeType: application/json` + `responseSchema` to enforce structured output at the API level. This prevents prose, markdown wrapping, and citation bleed.
- If the response comes back with bracketed citations despite the schema, add a Code node after the HTTP Request to strip them: `text.replace(/\[\d+\]/g, '')`
