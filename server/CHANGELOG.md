# CHANGELOG — fleet-agents/server.js

---

## FIXED

All fixes confirmed in current server.js. Listed in order applied.

**1. funding_signal always null in Postgres**
Neptune read `lead.funding_signal` where `lead = input.Enriched_Lead || input`, but Nemo never placed funding_signal at that path. Added `extractFundingSignal()` with priority-ordered path search and prose regex fallback against `health_audit_notes`.

**2. VOICE_CONSTRAINT not suppressing consultant language**
Original directive said "never imply" — too soft; model still slipped. Replaced with explicit NEVER list (founders I work with, peers in your position, clients I advise, my research focuses on) plus a positive identity anchor framing the voice as a researcher, not an adviser.

**3. Ahab returning job board aggregators as Company_Name**
Ahab returned Jobgether, Jobsora, etc. as valid companies, creating `lead_unknown_company__via_jobgether_` rows. Added COMPANY_FILTER as directive 7 in AHAB_SYSTEM prompt.

**4. Aggregator filter not enforced server-side**
Prompt-only enforcement is probabilistic. Added `AGGREGATORS` Set and pre-INSERT guard in Ahab handler; leads returning null are filtered from `session_ids` via `.filter(Boolean)`.

**5. Neptune null guard fired after normalizeNemoPayload**
`normalizeNemoPayload(nemo_payload)` ran before the `if (!nemo_payload)` guard, meaning a null payload was processed before being rejected. Moved null check above the normalizer call.

**6. contact_recon stored inconsistently between Nemo and Neptune**
Nemo wrote a raw JS object (pg serializes to JSONB); Neptune wrote `JSON.stringify(contactRaw)` — a string literal inside a JSONB column, breaking `contact_recon->>'email'` queries. Removed `JSON.stringify` from `normalizeNemoPayload`; both stages now pass raw object.

**7. ON CONFLICT reset Enriched and Finished leads to Scraped**
Nightly Ahab re-run on a previously completed lead reset `status = 'Scraped'` unconditionally, re-queuing it through Nemo and Neptune. Added `WHERE gtm_career_leads.status = 'Scraped'` to the `DO UPDATE` clause.

**8. Neptune failures invisible in fleet_errors**
Neptune `catch` returned 500 only; stalled leads showed as `Enriched` with no diagnostic entry. Added `NEPTUNE_FAILURE` insert into `fleet_errors` in Neptune's catch block.

**9. Nemo had no typed output contract**
NEMO_SYSTEM said "produce a Clay-ready structured output" but never defined the structure. Model inferred key names each run, causing drift (`Contact_Recon` vs `contact_recon`, missing `Enriched_Lead` wrapper, etc.). Added typed OUTPUT CONTRACT JSON skeleton as the final block in NEMO_SYSTEM.

**10. Neptune responseSchema missing funding_signal field**
Schema enforced `Neptune_Log` and `Outreach_Bite` but not `funding_signal`, so the field was absent from Neptune's output on every run. Added `funding_signal: { type: 'string', nullable: true }` to properties and `required` array.

**11. VOICE_CONSTRAINT was prohibition-only with no positive frame**
A list of forbidden phrases alone is less sticky than a positive identity. Added "Write in the voice of someone who spent 200 hours studying GTM failure patterns in public job postings and LinkedIn signals" as the anchor, plus "You observed this pattern. You did not advise on it." as the closing frame.

**12. Neptune discarded its own schema-enforced funding_signal output**
Handler called `extractFundingSignal(input)` — re-reading from the raw Nemo payload — even though Neptune's responseSchema now produces `result.funding_signal` directly. Neptune's assessed judgment was being ignored. Changed to `result.funding_signal ?? extractFundingSignal(input)`.

**13. Nemo never wrote funding_signal to its dedicated column**
Neptune failure left funding_signal buried inside `nemo_payload` JSONB, never surfacing in the dedicated column. Added `funding_signal = COALESCE($8, funding_signal)` to Nemo's UPDATE, reading from `result?.Enriched_Lead?.funding_signal`.

**14. SHIPWRECKED leads briefly showed as Enriched**
SHIPWRECKED check fired after the `status='Enriched'` UPDATE, creating a race window where a dead lead appeared alive. Moved SHIPWRECKED check before the first UPDATE. SHIPWRECKED branch now writes `status='Shipwrecked'` and `nemo_payload` in a single query before inserting `fleet_errors`.

**15. parsedInput.session_id dead code in Nemo handler**
`parsedInput` is the Ahab payload — it never contains `session_id`. First operand of `parsedInput.session_id || input_session_id || null` was always undefined. Removed; replaced with `const session_id = input_session_id || null`.

**16. input.session_id dead code in Neptune handler**
Same pattern: `input` is parsed from `nemo_payload`, which has no `session_id` field per the OUTPUT CONTRACT. Removed; replaced with `const session_id = input_session_id || null`.

**17. Nemo failures invisible in fleet_errors**
Nemo `catch` returned 500 only; failed leads stuck at `Scraped` indefinitely with no diagnostic entry. Added `NEMO_FAILURE` insert into `fleet_errors` in Nemo's catch block.

**18. Missing blank line between [The Divers] and [Core_Directives] in NEMO_SYSTEM**
Every other section boundary in the prompt had a blank line separator; this one did not. Risk of model blending the two sections during tokenization. Added blank line.

---

## ARCHITECTURE DECISIONS

Non-negotiable constraints. Do not change without explicit instruction.

**Nemo uses googleSearch grounding — responseSchema is incompatible, never add it.**
Gemini does not support `responseSchema` and `tools: [{ googleSearch: {} }]` simultaneously. Nemo's output contract is enforced via the in-prompt OUTPUT CONTRACT skeleton only, not via schema. Adding responseSchema to Nemo will break grounding.

**ON CONFLICT protects Finished/Enriched rows via `WHERE gtm_career_leads.status = 'Scraped'` guard.**
The `DO UPDATE` clause on Ahab's INSERT only fires when the existing row is still at `Scraped`. This prevents nightly re-runs from resetting leads that have already been enriched or synthesized. Removing this guard re-introduces the reset bug.

**contact_recon writes as a raw object — no JSON.stringify, pg handles JSONB serialization.**
Both Nemo and Neptune pass `Contact_Recon` as a raw JS object to pg. The pg driver serializes it correctly for the JSONB column. Wrapping in `JSON.stringify` stores a string literal inside JSONB, which breaks all `->` and `->>` operator queries downstream in Retool.

**session_id is always input_session_id — never read from payload.**
Neither the Ahab payload (parsed in Nemo) nor the Nemo payload (parsed in Neptune) contains a `session_id` field. The only valid source is `input_session_id` from the request body. Reading `payload.session_id` as a first operand is always undefined and must not be re-introduced.

---

## KNOWN GAPS

Identified but not yet implemented.

**Fetch timeout on Gemini calls.**
`callGenerateContent` has no timeout. A hung gemini-2.5-pro request blocks the n8n node indefinitely, stalling all downstream leads in that batch. Fix: pass `signal: AbortSignal.timeout(90_000)` to the `fetch` call inside `callGenerateContent`.

**funding_signal write in Nemo UPDATE via COALESCE (partially done — verify in production).**
The COALESCE write is implemented in code (`funding_signal = COALESCE($8, funding_signal)`), but has not been confirmed against live production runs. Verify that `result?.Enriched_Lead?.funding_signal` is populated by Nemo in practice now that the OUTPUT CONTRACT is in place.

**Typed contract simplification of normalizeNemoPayload and extractFrictionType.**
Both functions carry multi-path fallback logic built before the Nemo OUTPUT CONTRACT existed. With the contract stable in production, `normalizeNemoPayload` should reliably find email at `payload.Enriched_Lead.Contact_Recon.email` and `extractFrictionType` at `payload.Enriched_Lead.Forensic_Friction_Type`. Once production confirms the contract is holding, the fallback chains can be pruned to the primary path only.
