import express from 'express';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: '10.5.1.3',
  port: 5432,
  database: 'nocodb_data',
  user: 'fleet_app',
  password: 'DeepWaterHubPipeline2026',
  ssl: { rejectUnauthorized: false },
});

const app = express();
app.use(express.json());

const PROJECT = 'project-8bd530c5-c699-4b50-868';
const BASE_URL = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models`;

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function callGenerateContent(model, body) {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const url = `${BASE_URL}/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Agent Platform error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Second attempt: extract first complete JSON object
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return { raw };
  }
}

function extractFrictionType(payload) {
  const lead = payload?.Enriched_Lead || payload || {};
  const divers = lead.The_Divers || payload?.The_Divers || {};
  
  // Potential sources in order of reliability
  const candidates = [
    lead.Forensic_Friction_Type,
    lead.friction_type,
    divers.friction_notes,
    lead.friction_notes
  ];

  const forensicTerms = [
    'API Stutter', 
    'Scale Friction', 
    'Manual Data Debt', 
    'Displacement Signal'
  ];

  const serviceIntents = ['GTM', 'Accounting'];

  for (const val of candidates) {
    if (typeof val !== 'string') continue;
    
    // Check for exact forensic terms within the string
    const found = forensicTerms.find(term => val.toLowerCase().includes(term.toLowerCase()));
    if (found) return found;

    // If it's just a service intent, ignore it to prevent "GTM" contamination
    if (serviceIntents.some(intent => val.trim().toUpperCase() === intent)) continue;
    
    // Fallback: if it's one of the forensic terms exactly
    if (forensicTerms.includes(val.trim())) return val.trim();
  }

  return null;
}

function extractFundingSignal(payload) {
  if (payload?.Enriched_Lead?.funding_signal) return payload.Enriched_Lead.funding_signal;
  if (payload?.funding_signal) return payload.funding_signal;
  if (payload?.Nemo_Enrich_Audit?.funding_signal) return payload.Nemo_Enrich_Audit.funding_signal;

  const notes =
    payload?.The_Divers?.health_audit_notes ||
    payload?.Enriched_Lead?.The_Divers?.health_audit_notes ||
    '';
  if (typeof notes === 'string' && notes) {
    const m = notes.match(/\$[\d.,]+\s*[MBK]?(?:\s*million|\s*billion)?|Series\s+[A-E]|Seed\s+(?:round)?|Pre-?[Ss]eed/i);
    if (m) return m[0];
  }
  return null;
}

function normalizeNemoPayload(payload) {
  const email = 
    payload?.Contact_Recon?.email || 
    payload?.Contact_Recon?.email_pattern || 
    payload?.Contact_Recon?.email_pattern_guess || 
    payload?.contact_recon?.email || 
    payload?.contact_recon?.email_pattern || 
    payload?.contact_recon?.email_pattern_guess || 
    payload?.Enriched_Lead?.Contact_Recon?.email || 
    payload?.email || 
    null;

  const contactRaw = 
    payload?.Contact_Recon || 
    payload?.contact_recon || 
    payload?.Enriched_Lead?.Contact_Recon || 
    null;

  return {
    email,
    contact_recon: contactRaw || null,
    friction_type: extractFrictionType(payload)
  };
}

function sanitizeDirectUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.includes('vertexaisearch') || url.includes('grounding-api-redirect')) return null;
  return url;
}

function stripCitations(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim();
}

const AHAB_SYSTEM = `[Task]: Your sole mission is RAW DATA HARVESTING of opportunities. You are the high-volume scraper at the front-end of the pipeline.
[Persona]: Ahab, the Hunter.
[Sub-Agents]:
  - Technical Harpooner: Scans listings for tech-stack keywords defined in campaign config.
  - Signal Harpooner: Scans for growth and health keywords defined in campaign config.

[Handoff_Protocol]:
- Crucial: You are the Find stage. Nemo is the Enrich stage.
- Nemo will perform the deep-reasoning audit immediately after you deliver this payload.
- Do not burn tokens on analysis. Give Nemo the maximum number of raw leads possible.
- If the user provides a list of Excluded Companies in the prompt, DO NOT extract or return them.

[Reasoning_Protocol]:
- Execute 5+ varied search queries targeting the lead profile defined in campaign config.
- Every search query MUST use site-specific operators and direct portals where applicable.

[Core_Directives]:
1. SOURCE FOCUS: Prioritize the source channels defined in campaign config.
2. FILTER COMPLIANCE: Apply all global_filters from campaign config.
3. STRICT KEYWORD EXTRACTION: In Raw_Primary_Signals and Raw_Health_Signals, ONLY extract short phrases or keywords.
4. SEARCH ITERATION LOGIC: Execute a multi-step Search Pivot. Log every unique query in Harpooner_Logs.
5. NO SUMMARIES: Do not explain your thought process in the logs.
6. Fill the Catch array until the output token limit is reached.
7. COMPANY_FILTER: If the actual hiring company name cannot be determined from the listing, DO NOT include it in the Catch array. Job board aggregators (Jobgether, Jobsora, Indeed, Glassdoor) are not companies. Skip any listing where Company_Name would be "Unknown" or a job board name.
CRITICAL OUTPUT FORMAT: Return ONLY raw JSON. No markdown. No code fences. No backticks. Structure: {"Harpooner_Logs": ["query"], "Catch": [{"Company_Name": "string", "Job_URL": "string", "Location_Status": "string", "Raw_Primary_Signals": ["string"], "Raw_Health_Signals": ["string"]}]}`;

const AGGREGATORS = new Set(['jobgether', 'jobsora', 'indeed', 'glassdoor', 'linkedin', 'ziprecruiter']);

app.post('/api/ahab', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const result = await callGenerateContent('gemini-2.5-flash', {
      systemInstruction: { parts: [{ text: AHAB_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 16384,
      },
    });

    let session_ids = [];
    if (result.Catch && Array.isArray(result.Catch)) {
      const raw_ids = await Promise.all(result.Catch.map(async (lead) => {
        const company_name = lead.Company_Name || lead.company_name || '';
        const name_lower = company_name.toLowerCase().trim();
        if (!name_lower || name_lower === 'unknown' || AGGREGATORS.has(name_lower)) return null;
        const session_id = 'lead_' + company_name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        await pool.query(
          `INSERT INTO gtm_career_leads (session_id, company_name, ahab_payload, direct_url, status)
           VALUES ($1, $2, $3, $4, 'Scraped')
           ON CONFLICT (session_id, company_name)
           DO UPDATE SET
             ahab_payload = EXCLUDED.ahab_payload,
             status = 'Scraped'
           WHERE gtm_career_leads.status = 'Scraped'`,
          [session_id, company_name, JSON.stringify(lead), lead.Job_URL || null]
        );
        return session_id;
      }));
      session_ids = raw_ids.filter(Boolean);
    }

    res.json({ session_ids, harpooner_logs: result.Harpooner_Logs || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const NEMO_SYSTEM = `[Task]: SINGLE-LEAD DIAGNOSTIC ENRICHMENT.
[Persona]: Nemo, the Intelligence Analyst.
[Mission]: Analyze ONE lead. Identify the friction or displacement signal. Produce a Clay-ready structured output.

[Clay_Readiness_Protocol]:
- Every claim must be sourced. No invented details.
- Direct_URL must be the company own domain, not a job board.
- Direct_URL must be the company's own domain, confirmed by direct navigation. Return null if it cannot be independently verified.
- Contact_Recon must be a real person with a verifiable role.

[Target_Service_Intent_Routing]:
- Accounting: financial controllers, bookkeeping, reconciliation, QuickBooks spend signals
- GTM: RevOps, lead generation, CRM operations, marketing automation, Clay or n8n workflows

[Forensic_Dictionary]:
1. API Stutter: Data tools exist but do not talk to each other.
2. Scale Friction: Growth is outpacing data infrastructure capacity.
3. Manual Data Debt: Humans doing work that should be automated.
4. Displacement Signal: Paying a platform for something a specialist does better.

[CATALYST_STALE]: If the most recent funding event is older than 18 months from today, you MUST set status=SHIPWRECKED and reason_code=CATALYST_STALE. No exceptions. Return immediately after writing SHIPWRECKED status.

[The Divers — be concise, one sentence max per field]:
1. url_recon_notes: Confirm company direct domain. One sentence.
2. health_audit_notes: Note funding or growth signal if found. One sentence.
3. friction_notes: Name the friction category and one piece of evidence. One sentence.

[Core_Directives]:
- NO PROSE: Raw JSON only.
- CITATION_MANDATE: All string values must be plain prose only. No reference markers of any kind.
- PROOF_REQUIRED: Every technical claim MUST have a proof URL.
- CONTACT_RECON: Identify the decision-maker. Extract email pattern or LinkedIn profile.

OUTPUT CONTRACT:
{
  "Enriched_Lead": {
    "Company_Name": "string",
    "Direct_URL": "string",
    "Target_Service_Intent": "GTM | Accounting",
    "Forensic_Friction_Type": "API Stutter | Scale Friction | Manual Data Debt | Displacement Signal",
    "funding_signal": "string | null",
    "Contact_Recon": { "name": "string", "title": "string", "email": "string | null", "linkedin": "string | null" },
    "The_Divers": { "url_recon_notes": "string", "health_audit_notes": "string", "friction_notes": "string" }
    // All string values must be plain prose only. No reference markers of any kind.
  },
  "Nemo_Enrich_Audit": { "status": "ACTIVE | SHIPWRECKED", "reason_code": "string | null" }
}`;

app.post('/api/nemo', async (req, res) => {
  const { session_id: input_session_id } = req.body;
  if (!input_session_id) return res.status(400).json({ error: 'session_id required' });

  const leadRes = await pool.query('SELECT ahab_payload, company_name FROM gtm_career_leads WHERE session_id = $1 LIMIT 1', [input_session_id]);
  if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  
  const ahab_payload = leadRes.rows[0].ahab_payload;
  if (!ahab_payload || Object.keys(ahab_payload).length === 0) return res.status(400).json({ error: 'empty ahab_payload' });
  const message = JSON.stringify(ahab_payload);

  try {
    const result = await callGenerateContent('gemini-2.5-pro', {
      systemInstruction: { parts: [{ text: NEMO_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 8192,
      },
    });

    let parsedInput = {};
    try { parsedInput = typeof message === 'string' ? JSON.parse(message) : message; } catch {}
    const session_id = input_session_id || null;
    const lead = result.Enriched_Lead || parsedInput || {};
    const company_name = lead.Company_Name || parsedInput.Company_Name || null;
    const email = lead.Contact_Recon?.email || lead.contact_recon?.email || null;

    const divers = result?.Enriched_Lead?.The_Divers;
    if (divers) {
      if (divers.url_recon_notes) divers.url_recon_notes = stripCitations(divers.url_recon_notes);
      if (divers.health_audit_notes) divers.health_audit_notes = stripCitations(divers.health_audit_notes);
      if (divers.friction_notes) divers.friction_notes = stripCitations(divers.friction_notes);
    }
    const url_recon_notes = divers?.url_recon_notes || null;
    const health_audit_notes = divers?.health_audit_notes || null;
    const friction_notes_text = divers?.friction_notes || null;

    const friction_type = stripCitations(extractFrictionType(result)) || null;
    const nemo_funding_signal = stripCitations(result?.Enriched_Lead?.funding_signal || null) || null;

    if (result?.Nemo_Enrich_Audit?.status === 'SHIPWRECKED') {
      const reason_code = result.Nemo_Enrich_Audit.reason_code || null;
      await pool.query(
        'UPDATE gtm_career_leads SET status = \'Shipwrecked\', nemo_payload = $1 WHERE session_id = $2',
        [JSON.stringify(result), session_id]
      );
      await pool.query('INSERT INTO fleet_errors (session_id, reason_code, company_name) VALUES ($1, $2, $3)', [session_id, reason_code, company_name]);
      return res.json({ status: 'shipwrecked', reason_code, session_id });
    }

    if (session_id) {
      await pool.query(
        `UPDATE gtm_career_leads
         SET nemo_payload = $1,
             direct_url = COALESCE($2, direct_url),
             target_service_intent = $3,
             contact_recon = $4,
             status = $5,
             email = $6,
             friction_type = $7,
             funding_signal = COALESCE($8, funding_signal),
             url_recon_notes = COALESCE($9, url_recon_notes),
             health_audit_notes = COALESCE($10, health_audit_notes),
             friction_notes = COALESCE($11, friction_notes)
         WHERE session_id = $12`,
        [
          JSON.stringify(result),
          sanitizeDirectUrl(lead.Direct_URL),
          lead.Target_Service_Intent || null,
          lead.Contact_Recon || null,
          'Enriched',
          email,
          friction_type,
          nemo_funding_signal,
          url_recon_notes,
          health_audit_notes,
          friction_notes_text,
          session_id
        ]
      );
    }

    res.json({ status: 'success', session_id });
  } catch (err) {
    try {
      await pool.query(
        'INSERT INTO fleet_errors (session_id, reason_code, company_name) VALUES ($1, $2, $3)',
        [input_session_id, 'NEMO_FAILURE', leadRes.rows[0].company_name || null]
      );
    } catch {}
    res.status(500).json({ error: err.message });
  }
});

const NEPTUNE_SYSTEM = `[Task]: OUTREACH SYNTHESIS.
[Persona]: Neptune, the Authority Engine.
[Mission]: Receive a structured Friction Profile from Nemo. Synthesize it into a Schwartz-style Outreach Bite. One job. One output.

[Prime_Directive]:
You are not selling. You are confirming what the prospect already knows.

The Bite operates on three Schwartz principles:
1. REFLECT before you claim. Name what they are already doing before offering anything.
2. NAME THE VILLAIN. Name the specific tool, process, or platform that is failing them.
3. OFFER THE SPECIFIC OUTCOME. The exact thing they already want, stated in operational language.

The Bite is 3-4 sentences. Opens by reflecting reality. Names the villain. Offers the specific outcome. Closes with one peer suggestion — never a generic call to action.

[The_Rule_of_One_Mandate]:
1. One Reader: intimate 1-on-1 engagement.
2. First-Person ONLY: I never We.
3. One Peer Suggestion: actionable insight based on their specific signals.

[Funding_Signal_Handling]:
- If funding_signal present: Open with it as a momentum hook. One short clause, then pivot to friction.
- If funding_signal null: Omit entirely. Lead with friction.

[Core_Directives]:
- NO PROSE: Raw JSON only.
- BITE_CONSTRAINT: Maximum 3-4 sentences.
- DATA_STRICTNESS: Only reference what is in the input payload.
- VOICE_CONSTRAINT: Write as someone who has spent 200 hours studying GTM failure patterns from job postings and LinkedIn signals. Every observation comes from pattern recognition across hundreds of postings, not personal client work. State what you observed. Do not reference the act of observing.}`;

app.post('/api/neptune', async (req, res) => {
  const { session_id: input_session_id } = req.body;
  if (!input_session_id) return res.status(400).json({ error: 'session_id required' });

  const leadRes = await pool.query('SELECT nemo_payload, company_name FROM gtm_career_leads WHERE session_id = $1 LIMIT 1', [input_session_id]);
  if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  
  const nemo_payload = leadRes.rows[0].nemo_payload;
  if (!nemo_payload || Object.keys(nemo_payload).length === 0) return res.status(400).json({ error: 'empty nemo_payload' });
  const { email, contact_recon, friction_type: nemo_friction_type } = normalizeNemoPayload(nemo_payload);
  const message = JSON.stringify(nemo_payload);

  try {
    const result = await callGenerateContent('gemini-2.5-pro', {
      systemInstruction: { parts: [{ text: NEPTUNE_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          required: ['Neptune_Log', 'Outreach_Bite', 'funding_signal'],
          properties: {
            Neptune_Log: { type: 'object', properties: { intent_recognized: { type: 'string' }, friction_strategy: { type: 'string' }, rule_of_one_check: { type: 'string' } } },
            Outreach_Bite: { type: 'string' },
            funding_signal: { type: 'string', nullable: true },
          },
        },
      },
    });

    let input = {};
    try { input = typeof message === 'string' ? JSON.parse(message) : message; } catch {}
    const lead = input.Enriched_Lead || input;
    const session_id = input_session_id || null;
    const company_name = lead.Company_Name || null;
    const funding_signal = result.funding_signal ?? extractFundingSignal(input);

    if (session_id) {
      await pool.query(
        `UPDATE gtm_career_leads
         SET neptune_payload = $1,
             outreach_bite = $2,
             friction_type = COALESCE($3, friction_type),
             funding_signal = $4,
             email = $5,
             contact_recon = $6,
             status = 'Finished'
         WHERE session_id = $7`,
        [
          JSON.stringify(result),
          result.Outreach_Bite || null,
          nemo_friction_type,
          funding_signal,
          email,
          contact_recon,
          session_id
        ]
      );
    }

    res.json({ status: 'success', session_id, company_name });
  } catch (err) {
    try {
      await pool.query(
        'INSERT INTO fleet_errors (session_id, reason_code, company_name) VALUES ($1, $2, $3)',
        [input_session_id, 'NEPTUNE_FAILURE', leadRes.rows[0].company_name || null]
      );
    } catch {}
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reprocess', async (req, res) => {
  const { session_id: input_session_id } = req.body;
  if (!input_session_id) return res.status(400).json({ error: 'session_id required' });

  const leadRes = await pool.query('SELECT nemo_payload, company_name FROM gtm_career_leads WHERE session_id = $1 LIMIT 1', [input_session_id]);
  if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });

  const nemo_payload = leadRes.rows[0].nemo_payload;
  if (!nemo_payload || Object.keys(nemo_payload).length === 0) return res.status(400).json({ error: 'empty nemo_payload' });
  const { email, contact_recon, friction_type: nemo_friction_type } = normalizeNemoPayload(nemo_payload);
  const message = JSON.stringify(nemo_payload);

  try {
    const result = await callGenerateContent('gemini-2.5-pro', {
      systemInstruction: { parts: [{ text: NEPTUNE_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          required: ['Neptune_Log', 'Outreach_Bite', 'funding_signal'],
          properties: {
            Neptune_Log: { type: 'object', properties: { intent_recognized: { type: 'string' }, friction_strategy: { type: 'string' }, rule_of_one_check: { type: 'string' } } },
            Outreach_Bite: { type: 'string' },
            funding_signal: { type: 'string', nullable: true },
          },
        },
      },
    });

    let input = {};
    try { input = typeof message === 'string' ? JSON.parse(message) : message; } catch {}
    const lead = input.Enriched_Lead || input;
    const session_id = input_session_id || null;
    const company_name = lead.Company_Name || null;
    const funding_signal = result.funding_signal ?? extractFundingSignal(input);

    if (session_id) {
      await pool.query(
        `UPDATE gtm_career_leads
         SET neptune_payload = $1,
             outreach_bite = $2,
             friction_type = COALESCE($3, friction_type),
             funding_signal = $4,
             email = $5,
             contact_recon = $6,
             status = 'Finished'
         WHERE session_id = $7`,
        [
          JSON.stringify(result),
          result.Outreach_Bite || null,
          nemo_friction_type,
          funding_signal,
          email,
          contact_recon,
          session_id
        ]
      );
    }

    res.json({ status: 'reprocessed', session_id, company_name });
  } catch (err) {
    try {
      await pool.query(
        'INSERT INTO fleet_errors (session_id, reason_code, company_name) VALUES ($1, $2, $3)',
        [input_session_id, 'NEPTUNE_FAILURE', leadRes.rows[0].company_name || null]
      );
    } catch {}
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fleet agents listening on port ${PORT}`));
