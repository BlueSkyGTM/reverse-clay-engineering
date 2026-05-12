# SOVEREIGN FLEET MANUAL: n8n & Server Integration

## 1. THE ARCHITECTURAL GOAL- **Target:** 1,500 leads per cycle.- **Strategy:** Steady Batching (50 leads every 10 mins).- **Model:** Pull Model (n8n only moves IDs; Server moves Data).

---## 2. THE SERVER CONTRACT (CLI GUIDELINES)
The server acts as a high-concurrency engine. Every endpoint must be "Resilient" to n8n data shifts.### A. Payload Normalization (The Zero-Bug Fix)
Every POST route must include this adapter to handle nested n8n objects or raw arrays:`let leads = req.body.leads || (Array.isArray(req.body) ? req.body : [req.body]);`### B. Concurrency Tuning- **Nemo (Enrichment):** `p-limit(10)`- **Neptune (Synthesis):** `p-limit(15)`- This ensures 50 leads are processed in parallel in < 120s.

---## 3. THE n8n COMMAND RELAY (WORKFLOW BUILDER)
Every workflow must follow this linear 4-node chain. **No conditionals.**### Node 1: Engine_Ignition (Schedule Trigger)
- **Interval:** 10 Minutes (crucial for hitting the 1,500 goal).

### Node 2: Fetch_Requeue_IDs (Postgres)
- **Goal:** Pull the next "Batch of 50".
- **SQL:** ```sql
  SELECT session_id, company_name 
  FROM gtm_career_leads 
  WHERE status = 'Scraped' AND contact_name IS NULL 
  LIMIT 50;
Node 3: Parse_Session_IDs (Code)
Goal: Wrap list items into a server-ready leads object.
Code:

JavaScript

const items = $input.all();return { json: { leads: items.map(i => ({ session_id: i.json.session_id, company_name: i.json.company_name })) } };
Node 4: Fleet_Call (HTTP Request)
Method: POST
Body: {{ $json }}
Endpoints: /api/nemo -> /api/neptune

### **Why this is "Rock Solid":**
By consolidating this, you’ve eliminated the risk of the CLI getting "cute" with the architecture. It now knows that n8n's only job is to **trigger** the server, and the server's job is to **manage the batch**.



**This is the final handshake. You are ready to run the 1,500-lead cycle.** Is the first batch of 50 ready in the database?