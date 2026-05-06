# WORKFLOW_USAGE.md — How to Use PAFA Workflow JSONs

> Authored by GPT-4o-mini via proxy

This guide covers importing and operating the two non-Hunt workflow variants: bulk enrichment and re-enrichment. For the standard Hunt workflow, see WORKFLOW_BUILDER.md.

---

## 1. How to Import a Workflow into n8n

Applies to both `workflow_bulk_v1.json` and `workflow_reenrich_v1.json`.

1. Log in to your n8n instance.
2. In the left sidebar, click **Workflows**.
3. Click **Import** (upward arrow icon).
4. In the dialog, click **Upload JSON File**.
5. Select the workflow JSON file from your local filesystem.
6. Review the node preview, then click **Save**.
7. Set the workflow to **Inactive** until you have tested it manually.

Repeat for the second workflow if importing both.

---

## 2. workflow_bulk_v1.json — GTM Bulk Enrichment

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

## 3. workflow_reenrich_v1.json — GTM Career Re-Enrichment

**Purpose:** Re-run Nemo and Neptune on existing leads in `gtm_career_leads` that completed enrichment before contact columns were added. Targets leads where `status = 'Finished'` and `contact_name IS NULL`. No input required.

**Node chain:**
```
Engine_Ignition → Fetch_Requeue_IDs → Parse_Session_IDs → Nemo_Fleet_Call → Neptune_Fleet_Call
```

**Schedule:** Sunday 6AM (can be triggered manually at any time).

### When to run it

- After adding new columns to the schema (e.g. `contact_name`, `job_title`) — re-enrichment backfills those columns on existing rows.
- Any time you notice `Finished` leads with blank contact fields in Retool.

### Trigger manually

1. Open `workflow_reenrich_v1` in n8n.
2. Click **Execute Workflow**. No node editing required — the `/api/requeue` endpoint finds eligible leads automatically (up to 50 per run).
3. If more than 50 leads need backfilling, run it multiple times until the queue is empty.

---

## 4. Verifying a Successful Run

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

**For re-enrichment** — rows that had `contact_name IS NULL` should now be populated:

```sql
SELECT company_name, contact_name, contact_title, linkedin_url, status
FROM gtm_career_leads
WHERE contact_name IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

**Check for failures:**

```sql
SELECT * FROM fleet_errors ORDER BY occurred_at DESC LIMIT 20;
```

---

## 5. Common Mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Forgetting to populate `Set_Bulk_Input` before running bulk | `/api/seed` receives empty array, returns no session_ids, workflow exits with zero output | Always edit and save the node before executing |
| Not saving after editing a node | n8n discards edits on next load | Hit Save after every node change |
| Running re-enrichment when queue is already empty | `/api/requeue` returns `[]`, workflow exits cleanly with no output — not an error | Check Retool first; if all leads have contact_name, nothing to do |
| Activating the schedule before testing manually | Untested workflow fires at 3AM or 6AM and fails silently | Execute manually first, confirm green ticks, then activate |
| Importing JSON without verifying the fleet-agents URL | Requests go to wrong endpoint if URL changed | Confirm each HTTP Request node points to `https://fleet-agents-954265623326.us-central1.run.app` after import |
