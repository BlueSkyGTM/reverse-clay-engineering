# Outbound Pipeline

It runs at 2AM. By morning there are new rows in Postgres. Each one has a company name, a verified domain, a documented friction type, a named contact, and three to four sentences ready to send.

You didn't know if this would work. It works.

---

## What PAFA Is

PAFA is Pipeline-As-File-Architecture. That name is doing more work than it looks like.

The idea isn't just that files are a tidy way to store things. It's that the file system is the only place cognition can survive across sessions. Every agent prompt, every schema, every architecture decision, every incident — if it isn't in a file, it doesn't exist the next time you open a terminal. You learned this the hard way. You'd make a breakthrough, close the session, come back the next day, and spend an hour reconstructing what you'd already figured out.

PAFA is the answer to that. Before any code changes, the file changes. Before the database changes, the schema file changes. Before the prompt changes, the staging area changes. The file system isn't storage. It's memory. It's the thing that lets you pick up exactly where you stopped — not approximately, not close enough, exactly.

This matters more than it sounds. You're building something complex enough that no single session can hold the whole picture. PAFA is what makes it coherent across the gaps.

---

## The Problem

The original design was reasonable. n8n calls Gemini, gets a lead back, passes it to the next node, calls Gemini again with the full context, passes it again, writes to Postgres at the end. Three agents, three nodes, one chain. Clean on the whiteboard.

In practice it was a cargo truck trying to do surgery.

n8n's expression engine doesn't like 8,000 tokens of JSON in a node field. Agent Platform doesn't like n8n's body serialization. The response comes back compressed and n8n's HTTP parser chokes on it. You fix the compression header and the body breaks. You fix the body and the column mapping breaks. You fix the column mapping and SHIPWRECKED leads need an IF branch, and the IF branch needs its own wiring, and now the workflow has nine nodes and looks like a circuit diagram and still fails in new ways every time.

Four workflow versions. A growing incident log. Nights debugging things that should have worked.

The Push Model — where n8n carries the lead data between every node — was the source of all of it. An agent that just produced 8,000 tokens of forensic output doesn't need n8n to hold that output and hand it to the next agent like a relay baton. It needs somewhere to put it. It needs the next agent to go get it when it's ready.

That's the whole insight. It just took four versions to see it clearly.

---

## The Pull Model

The moment it clicked: agents own their data. n8n owns nothing but the schedule.

The workflow is six nodes now. Linear. No branches.

```
Engine_Ignition → Set_Campaign_Message → Ahab_Fleet_Call → Parse_Session_IDs → Nemo_Fleet_Call → Neptune_Fleet_Call
```

After Ahab fires, n8n never sees another lead payload again. Every node after Parse_Session_IDs receives exactly this:

```json
{ "session_id": "lead_acme_corp" }
```

One string. That's it. That's the entire handoff.

Ahab finds leads, generates a deterministic session_id per company, and INSERTs a row into Postgres with everything it knows about the lead. It returns an array of session_ids to n8n. n8n splits the array and passes one session_id to each downstream run. It has no idea what the lead data looks like. It doesn't need to.

Nemo receives a session_id. It goes to Postgres, pulls the raw lead data Ahab left there, reasons over it, and writes its enriched output back to the same row. It returns a status to n8n. Not a lead. A status.

Neptune receives a session_id. It goes to Postgres, pulls what Nemo wrote, synthesizes an Outreach Bite, and writes that back too. The row is now complete. Neptune returns success.

SHIPWRECKED leads — companies where the enrichment fails, or the funding catalyst is older than 18 months, or the domain doesn't resolve — are handled inside Nemo's endpoint. The fleet_errors table gets a row. The lead row gets `status='Shipwrecked'`. n8n never knows. No IF branch. No dead-end paths in the canvas. The workflow doesn't branch because it doesn't need to.

n8n is a starter pistol now. It fires and gets out of the way.

---

## The Three Agents

**Ahab** hunts. Named for the captain in Moby Dick — the one who won't stop, won't rest, won't consider the cost of the chase. That's exactly his job. Maximum volume. Zero analysis. He executes five or more search pivots per run using Google Search grounding through Gemini Flash, fills the catch array until he hits the token limit, and hands off to Nemo. He doesn't think about quality. That's not his job. His job is the catch.

**Nemo** thinks. Named for Captain Nemo — the one who lives below the surface, who sees the world the way it actually is rather than the way it presents itself from above. His job is forensic enrichment on a single lead at a time. He resolves the real domain, not the job board URL. He identifies the specific friction category from four possibilities: API Stutter, Scale Friction, Manual Data Debt, Displacement Signal. He surfaces the contact who owns the problem, extracts an email pattern, finds the proof URL for every technical claim. Nothing invented. Nothing assumed. Every assertion sourced.

**Neptune** writes. Named for the god who rules the deep — the authority that doesn't announce itself, it simply is. His job is the Outreach Bite: three to four sentences that reflect the prospect's exact reality back at them, name the specific villain that's costing them, and offer the specific outcome in their operational language. He closes with one peer suggestion based on their actual signals. Not a feature. Not a capability. A thing they already want, described in the words they'd use to want it. He speaks as an individual, first person, never "we." He never asks for a meeting.

---

## What Nemo Produces

Without Clay. Without scraping. Without proxies. Without per-row credits.

Nemo uses Gemini 2.5 Pro and a response schema enforced at the API level. Every field is typed. The output is either ENRICHED or SHIPWRECKED with a specific reason code — SUCCESS, 404_STUTTER, DATA_THIN, CATALYST_STALE. There is no ambiguity about what came out.

What a lead looks like after Nemo is done with it:
- A verified direct domain that isn't a job board
- A friction type from the Forensic Dictionary with a URL proving the technical or operational claim
- A funding signal or growth marker if it exists publicly, omitted cleanly if it doesn't
- A named decision-maker with a verifiable role, not a generic inbox
- An email pattern or LinkedIn profile
- A target service intent — GTM or Accounting — routed from evidence, not assumed

Gemini is reading the open web in real time. It finds what's actually there. The enrichment is live, not cached, not scraped from a database that was last refreshed six months ago.

This is what the system prompt makes possible. The prompt is the product.

---

## The Data Layer

Every lead lives in a single unified table for its campaign. For GTM Career Hunt that's `gtm_career_leads`.

```
session_id (PK) | company_name | ahab_payload | nemo_payload | neptune_payload | outreach_bite | status
```

Three JSONB buckets — one per agent. The full reasoning output from each agent lives in its bucket. The extracted outreach_bite lives in its own column so Retool can surface it without parsing JSON. The status column tells the whole story in one word:

```
Scraped → Enriched → Finished
                   ↘ Shipwrecked
Finished → Exported
```

One row per company. Session IDs are deterministic — `lead_` plus the normalized company name — so the same company appearing across multiple runs overwrites instead of multiplies. The table is always a clean, current view of every lead and exactly where it stands.

Postgres is on Cloud SQL, private IP only, connected via Direct VPC Egress. The agents connect via pg client inside the fleet-agents Express server on Cloud Run. Same VPC. No proxy, no connector, no auth overhead. Parameterized queries mean apostrophes, special characters, and nulls are never a problem. n8n never touches the database.

Retool reads the table directly for review and export. Zero schema coupling — it connects to Postgres and nothing else.

---

## What It Produces

Neptune's Outreach Bites aren't email templates. They're not personalization tokens. They're not the output of a system that found your first name and your company on LinkedIn.

They're three to four sentences that name the specific thing the prospect is already thinking about. The Schwartz structure: reflect their reality first — their actual stack, their actual process — before claiming anything. Name the villain specifically — not "your current tools" but the platform they're overpaying for, the process that breaks when they scale. Offer the exact outcome in their operational language. Close with one actionable peer suggestion based on their actual signals. No generic ask.

A Bite that hits lands because the prospect recognizes themselves in it before they recognize you. That recognition is worth more than any feature list. That's the only kind of cold outreach that actually works.

---

## What Comes Next

This is never done.

The current campaigns run on GTM and Accountant ICPs — companies hiring for revenue operations and finance automation roles, sourced from job boards and Upwork. They run nightly. They produce.

The next layer is Claude Code as the full orchestration layer. n8n is already reduced to a scheduler. The logical extension is Claude Code sessions that run the pipeline on demand, inspect results, and trigger follow-up enrichment passes without waiting for the 2AM cron. No middleware. No workflow canvas. Just code talking directly to the endpoints and to the database.

New campaigns are mechanical now. New Postgres table, new endpoint in server.js, new workflow JSON with four variable substitutions. The infrastructure never changes. `framework/WORKFLOW_BUILDER.md` makes the build deterministic.

The longer arc is a skill layer — reusable campaign types that can be instantiated for any ICP in minutes. The architecture is already there. The file system is already the specification.

---

## The Catalyst

This started in a university basement. Hours spent on context engineering — writing instructions to AI systems that nobody had a name for yet, learning through iteration what made a model behave precisely versus approximately.

Anthropic's research opened my eyes to what I was actually doing. There was a discipline here. There was a craft. But it was a conversation with Claude that pushed me to recognize it as something worth building on.

The line that changed everything: *"The system prompt is more important than the model."*

That's what Nemo is. That's what Neptune is. Not API calls. Not automation scripts. Careful, deliberate instructions to a mind you can't fully see — written with the same discipline as direct response copy because they're the same thing. You're writing to produce a specific behavior in a specific reader. The reader is a language model. The behavior is forensic enrichment and Schwartz-structured outreach. The discipline is identical.

We're reproducing Clay-quality enrichment on infrastructure we own. Because the prompt was right.

That's the whole story.

---

## File Map

```
outbound-pipeline/
├── CLAUDE.md                         Session instructions and current architecture reference
├── STATE.md                          Current pickup point — read this before starting
├── framework/
│   └── WORKFLOW_BUILDER.md           Deterministic build instructions for new campaign workflows
├── pipeline/
│   ├── infrastructure/
│   │   └── sovereign_hub.md          Infrastructure map, credentials, incident log, Pull Model spec
│   ├── memory/
│   │   └── schema_map.sql            Source of truth for all table schemas
│   └── nodes/
│       └── library.json              Node definitions for all 6 Pull Model workflow nodes
├── fleet-agents/
│   ├── server.js                     All agent logic, AI calls, and Postgres persistence
│   └── package.json                  Node dependencies
└── campaigns/
    └── gtm_career_hunt/
        └── workflow_v6.json          Current Pull Model workflow — 6 nodes, linear chain
```
