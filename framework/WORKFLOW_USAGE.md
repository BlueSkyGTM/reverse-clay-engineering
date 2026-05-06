# WORKFLOW_USAGE.md — How to Use PAFA Workflow JSONs

> Authored by GPT-4o-mini via proxy

This guide covers importing and operating workflow JSONs. For workflow construction, see WORKFLOW_BUILDER.md.

---

## 1. How to Import a Workflow into n8n

1. Log in to your n8n instance.
2. In the left sidebar, click **Workflows**.
3. Click **Import** (upward arrow icon).
4. In the dialog, click **Upload JSON File**.
5. Select the workflow JSON file from your local filesystem.
6. Review the node preview, then click **Save**.
7. Set the workflow to **Inactive** until you have tested it manually.

---

## 2. workflow_bulk_v1.json — Bulk Enrichment

**Purpose:** Enrich a manually provided list of companies. You supply the companies; the pipeline seeds them into Postgres and runs full Nemo → Neptune enrichment.

**Node chain:**
```
Engine_Ignition → Set_Bulk_Input → Seed_Fleet_Call → Parse_Session_IDs → Nemo_Fleet_Call → Neptune_Fleet_Call
```

**Schedule:** Monday 3AM (can be triggered manually at any time).

### Before each run — populate the companies array

1. Open the workflow in n8n.
2. Click the **Set_Bulk_Input** node.
3. In the Properties panel, locate the **companies** array field.
4. Replace the empty array with your list. Each entry must have `company_name` (required) and `job_url` (optional):

```json
[
  { "company_name": "Acme Corp", "job_url": "https://acmecorp.com/careers/revops" },
  { "company_name": "Lattice", "job_url": "https://lattice.com/jobs/gtm-engineer" }
]
```

5. Click **Save** in the top right. n8n does not auto-save node edits.

### Trigger manually

Click the **Execute Workflow** button (play icon, top right of canvas). Do not wait for Monday if you need results now.

---

## 3. Verifying a Successful Run

### In n8n

1. Click the **Executions** tab.
2. Open the most recent execution.
3. Every node should show a green tick. A red node indicates failure — click it to read the error message.

### In Retool or Postgres

**For bulk enrichment** — new rows should appear with `status = 'Finished'` for the companies you provided:

```sql
SELECT company_name, contact_name, contact_title, outreach_bite, status
FROM gtm_career_leads
ORDER BY created_at DESC
LIMIT 20;
```

**Check for failures:**

```sql
SELECT * FROM fleet_errors ORDER BY occurred_at DESC LIMIT 20;
```

---

## 4. Common Mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Forgetting to populate `Set_Bulk_Input` before running bulk | `/api/seed` receives empty array, returns no session_ids, workflow exits with zero output | Always edit and save the node before executing |
| Not saving after editing a node | n8n discards edits on next load | Hit Save after every node change |
| Activating the schedule before testing manually | Untested workflow fires at 3AM and fails silently | Execute manually first, confirm green ticks, then activate |
| Importing JSON without verifying the fleet-agents URL | Requests go to wrong endpoint if URL changed | Confirm each HTTP Request node points to `https://fleet-agents-954265623326.us-central1.run.app` after import |

---

## 5. How to Swap Search Terms for Career Hunt and Upwork Hunt Workflows

> Proxy: chatcmpl-DcPBHvP0ZaZLqB1kvSAeOFaJ5PMrv | gpt-4o-mini-2024-07-18

**Node to edit:** `Set_Campaign_Message` — node 2 in the chain (after `Engine_Ignition`).

**What the field contains:** The `campaign_message` assignment holds a plain English string passed directly to Ahab. It contains the campaign name, role types, company profile, tech signals, and filters. Everything Ahab uses to search is in this one string.

**How to update safely:**
1. Open the workflow in n8n and click **Set_Campaign_Message**.
2. In the Properties panel, locate the `campaign_message` assignment value field.
3. Edit only the string value. Do not rename the assignment (`campaign_message`), do not change the node name, do not touch any other node.
4. Click **Save** before closing.

**Before / after example — swapping role types:**

Before:
```
Campaign: GTM Career Hunt. Search for remote RevOps, MarOps, GTM Engineering, Marketing Automation roles at Series A/B B2B SaaS companies. Tech signals: n8n, Clay, HubSpot, Zapier, Salesforce. Remote only. Active listings only. Return maximum leads.
```

After (adding Sales Engineer, removing MarOps):
```
Campaign: GTM Career Hunt. Search for remote RevOps, GTM Engineering, Sales Engineering, Marketing Automation roles at Series A/B B2B SaaS companies. Tech signals: n8n, Clay, HubSpot, Zapier, Salesforce. Remote only. Active listings only. Return maximum leads.
```

Nothing else in the workflow changes. All routing, enrichment, and outreach logic lives in server.js — the workflow is just a trigger.
