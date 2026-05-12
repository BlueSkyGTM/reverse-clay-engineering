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
const BASE_URL = `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/us-central1/publishers/google/models`;

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
  
  if (!raw || !raw.trim()) {
    throw new Error(`[Circuit Breaker] Empty payload received from model ${model}.`);
  }

  // Clean potential markdown markers and extract JSON
  const cleaned = raw.trim();
  
  try {
    // Attempt 1: Direct parse
    return JSON.parse(cleaned);
  } catch (e) {
    // Attempt 2: Regex-based extraction (Outer most braces or brackets)
    const match = cleaned.match(/[\{\[]([\s\S]*)[\}\]]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        console.error(`[callGenerateContent] Regex parse failure for model ${model}:`, innerError.message);
      }
    }
    
    console.error(`[callGenerateContent] Final parse failure for model ${model}. Raw response snippet: ${raw.substring(0, 200)}...`);
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
4. SEARCH ITERATION LOGIC: Execute a multi-step Search Pivot. You MUST execute at least 10 search queries across different ATS platforms (Greenhouse, Lever, Ashby, Workable).
5. NO SUMMARIES: Do not explain your thought process in the logs.
6. TARGET CAPACITY: Extract exactly 50 UNIQUE leads into the Catch array. Do not stop until you have 50. If you encounter an aggregator (Indeed, LinkedIn), you MUST perform a sub-search to find the original hiring company name.
7. COMPANY_PRECISION: Never use generic terms like "Remote", "Confidential", or "Hiring Company" as the Company_Name. If the hiring company is not 100% clear, skip the lead and pivot your search.
CRITICAL OUTPUT FORMAT: Return ONLY a single raw JSON object. DO NOT include markdown code blocks, DO NOT include \`\`\`json or \`\`\`. No conversational filler. Structure: {"Harpooner_Logs": ["query"], "Catch": [{"Company_Name": "string", "Job_URL": "string", "Location_Status": "string", "Raw_Primary_Signals": ["string"], "Raw_Health_Signals": ["string"], "routing_target": "GTM | Accounting"}]}`;

const AGGREGATORS = new Set(['jobgether', 'jobsora', 'indeed', 'glassdoor', 'linkedin', 'ziprecruiter']);

app.post('/api/ahab', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const result = await callGenerateContent('gemini-2.5-pro', {
      systemInstruction: { parts: [{ text: AHAB_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 32768,
      },
    });
    if (result?.raw) throw new Error('Gemini returned unparseable response — raw fallback detected');

    let session_ids = [];
    if (result.Catch && Array.isArray(result.Catch)) {
      for (const lead of result.Catch) {
        const company_name = lead.Company_Name || lead.company_name || '';
        const name_lower = company_name.toLowerCase().trim();
        if (!name_lower || name_lower === 'unknown' || AGGREGATORS.has(name_lower)) continue;
        const session_id = 'lead_' + company_name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        await pool.query(
          `INSERT INTO gtm_career_leads (session_id, company_name, ahab_payload, direct_url, job_url, status)
           VALUES ($1, $2, $3, $4, $5, 'Scraped')
           ON CONFLICT (session_id, company_name)
           DO UPDATE SET
             ahab_payload = EXCLUDED.ahab_payload,
             job_url = EXCLUDED.job_url,
             status = 'Scraped'
           WHERE gtm_career_leads.status = 'Scraped'`,
          [session_id, company_name, JSON.stringify(lead), sanitizeDirectUrl(lead.Job_URL), sanitizeDirectUrl(lead.Job_URL)]
        );
        session_ids.push(session_id);
      }
    }

    res.json({ session_ids, harpooner_logs: result.Harpooner_Logs || [] });
  } catch (err) {
    try {
      await pool.query(
        'INSERT INTO fleet_errors (session_id, reason_code, company_name) VALUES ($1, $2, $3)',
        [null, 'AHAB_FAILURE', null]
      );
    } catch {}
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/seed', async (req, res) => {
  const { companies } = req.body;
  if (!Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: 'companies array required' });
  }
  try {
    let session_ids = [];
    for (const entry of companies) {
      const company_name = entry.company_name || '';
      const name_lower = company_name.toLowerCase().trim();
      if (!name_lower || name_lower === 'unknown' || AGGREGATORS.has(name_lower)) continue;
      const session_id = 'lead_' + company_name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const job_url = sanitizeDirectUrl(entry.job_url || null);
      const ahab_payload = { Company_Name: company_name, Job_URL: entry.job_url || null };

      await pool.query(
        `INSERT INTO gtm_career_leads (session_id, company_name, ahab_payload, direct_url, job_url, status)
         VALUES ($1, $2, $3, $4, $5, 'Scraped')
         ON CONFLICT (session_id, company_name)
         DO UPDATE SET
           ahab_payload = EXCLUDED.ahab_payload,
           job_url = EXCLUDED.job_url,
           status = 'Scraped'
         WHERE gtm_career_leads.status = 'Scraped'`,
        [session_id, company_name, JSON.stringify(ahab_payload), job_url, job_url]
      );
      session_ids.push(session_id);
    }
    res.json({ session_ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const NEMO_BULK_SYSTEM = `[Task]: BATCH DIAGNOSTIC ENRICHMENT.
[Persona]: Nemo, the Intelligence Analyst.
[Mission]: Analyze an array of leads. For EACH lead, identify the friction or displacement signal. Produce a Clay-ready structured output for every item.

[Clay_Readiness_Protocol]:
- Every claim must be sourced. No invented details.
- Direct_URL must be the company's own domain, confirmed by direct navigation. Return null if it cannot be independently verified.
- Contact_Recon must be a real person with a verifiable role.

[Forensic_Dictionary]:
1. API Stutter | 2. Scale Friction | 3. Manual Data Debt | 4. Displacement Signal.

[CATALYST_STALE]: If funding is > 18 months old, status=SHIPWRECKED.

[Core_Directives]:
- NO PROSE: Return ONLY a JSON array of objects.
- CITATION_MANDATE: No reference markers.
- PROOF_REQUIRED: Every technical claim MUST have a proof URL.

OUTPUT CONTRACT:
[
  {
    "session_id": "string (the original session_id passed in)",
    "company_name": "string",
    "Enriched_Lead": {
      "Company_Name": "string",
      "Direct_URL": "string",
      "Target_Service_Intent": "GTM | Accounting",
      "Forensic_Friction_Type": "string",
      "funding_signal": "string | null",
      "Job_Title": "string",
      "Contact_Recon": { "name": "string", "title": "string", "email": "string | null", "linkedin": "string | null" },
      "The_Divers": { "url_recon_notes": "string", "health_audit_notes": "string", "friction_notes": "string" }
    },
    "Nemo_Enrich_Audit": { "status": "ACTIVE | SHIPWRECKED", "reason_code": "string | null" }
  }
]`;

app.post('/api/nemo', async (req, res) => {
  let { leads, session_id, company_name } = req.body;
  
  // Normalization Layer: convert single lead to batch of 1
  if (!leads && session_id) {
    leads = [{ session_id, company_name }];
  }

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'leads array or session_id required' });
  }

  try {
    // 1. Fetch Ahab Payloads for all leads in the batch
    const query = `
      SELECT session_id, company_name, ahab_payload 
      FROM gtm_career_leads 
      WHERE (session_id, company_name) IN (${leads.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`;
    
    const params = leads.flatMap(l => [l.session_id, l.company_name]);
    const leadRes = await pool.query(query, params);
    
    if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Leads not found' });

    // 2. Prepare the batch message
    const batchData = leadRes.rows.map(r => ({
      session_id: r.session_id,
      company_name: r.company_name,
      ahab_payload: r.ahab_payload
    }));

    const result = await callGenerateContent('gemini-2.5-pro', {
      systemInstruction: { parts: [{ text: NEMO_BULK_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(batchData) }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 32768,
      },
    });

    if (!Array.isArray(result)) {
      throw new Error('Nemo Bulk failed: Gemini did not return an array.');
    }

    // 3. Sequential Updates for the entire batch
    const session_ids = [];
    for (const item of result) {
      const { session_id, company_name, Enriched_Lead: lead, Nemo_Enrich_Audit: audit } = item;
      if (!session_id || !company_name) continue;

      const email = lead?.Contact_Recon?.email || null;
      const contact_name = lead?.Contact_Recon?.name || null;
      const contact_title = lead?.Contact_Recon?.title || null;
      const linkedin_url = lead?.Contact_Recon?.linkedin || null;
      const job_title = lead?.Job_Title || null;

      const divers = lead?.The_Divers;
      if (divers) {
        if (divers.url_recon_notes) divers.url_recon_notes = stripCitations(divers.url_recon_notes);
        if (divers.health_audit_notes) divers.health_audit_notes = stripCitations(divers.health_audit_notes);
        if (divers.friction_notes) divers.friction_notes = stripCitations(divers.friction_notes);
      }

      const friction_type = stripCitations(extractFrictionType(item)) || null;
      const nemo_funding_signal = stripCitations(lead?.funding_signal || null) || null;

      if (audit?.status === 'SHIPWRECKED') {
        await pool.query(
          'UPDATE gtm_career_leads SET status = \'Shipwrecked\', nemo_payload = $1 WHERE session_id = $2 AND company_name = $3',
          [JSON.stringify(item), session_id, company_name]
        );
        await pool.query('INSERT INTO fleet_errors (session_id, reason_code, company_name) VALUES ($1, $2, $3)', [session_id, audit.reason_code, company_name]);
        continue;
      }

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
             friction_notes = COALESCE($11, friction_notes),
             contact_name = $12,
             contact_title = $13,
             linkedin_url = $14,
             job_title = $15
         WHERE session_id = $16 AND company_name = $17`,
        [
          JSON.stringify(item),
          sanitizeDirectUrl(lead?.Direct_URL),
          lead?.Target_Service_Intent || null,
          lead?.Contact_Recon || null,
          'Enriched',
          email,
          friction_type,
          nemo_funding_signal,
          divers?.url_recon_notes || null,
          divers?.health_audit_notes || null,
          divers?.friction_notes || null,
          contact_name,
          contact_title,
          linkedin_url,
          job_title,
          session_id,
          company_name
        ]
      );
      session_ids.push(session_id);
    }

    res.json({ status: 'success', processed_count: session_ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const NEPTUNE_BULK_SYSTEM = `[Task]: BATCH OUTREACH SYNTHESIS.
[Persona]: Neptune, the Authority Engine.
[Mission]: Analyze an array of Enriched Leads. For EACH lead, synthesize a Schwartz-style Outreach Bite.

[The_Rule_of_One_Mandate]:
1. One Reader | 2. First-Person ONLY | 3. One Peer Suggestion.

[Core_Directives]:
- NO PROSE: Return ONLY a JSON array of objects.
- BITE_CONSTRAINT: 3-4 sentences per lead.
- DATA_STRICTNESS: Only reference provided payload.
- VOICE: Operational pattern recognition.

OUTPUT CONTRACT:
[
  {
    "session_id": "string",
    "company_name": "string",
    "Neptune_Log": { "intent_recognized": "string", "friction_strategy": "string", "rule_of_one_check": "string" },
    "Outreach_Bite": "string",
    "funding_signal": "string | null"
  }
]`;

async function runNeptuneBulkSynthesis(leads) {
  // 1. Fetch Nemo Payloads for the entire batch
  const query = `
    SELECT nemo_payload, company_name, session_id 
    FROM gtm_career_leads 
    WHERE (session_id, company_name) IN (${leads.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`;
  
  const params = leads.flatMap(l => [l.session_id, l.company_name]);
  const leadRes = await pool.query(query, params);
  
  if (leadRes.rows.length === 0) throw new Error('Leads not found');

  const batchData = leadRes.rows.map(r => ({
    session_id: r.session_id,
    company_name: r.company_name,
    nemo_payload: r.nemo_payload
  }));

  try {
    const result = await callGenerateContent('gemini-2.5-flash', {
      systemInstruction: { parts: [{ text: NEPTUNE_BULK_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(batchData) }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 32768,
      },
    });

    if (!Array.isArray(result)) {
      throw new Error('Neptune Bulk failed: Gemini did not return an array.');
    }

    // 2. Sequential Updates for the batch
    const processed = [];
    for (const item of result) {
      const { session_id, company_name, Outreach_Bite, Neptune_Log, funding_signal: result_funding } = item;
      if (!session_id || !company_name) continue;

      // Extract details for the sequential update
      const nemo_row = batchData.find(d => d.session_id === session_id && d.company_name === company_name);
      if (!nemo_row) continue;
      
      const { email, contact_recon, friction_type: nemo_friction_type } = normalizeNemoPayload(nemo_row.nemo_payload);
      const funding_signal = result_funding ?? extractFundingSignal(nemo_row.nemo_payload);

      await pool.query(
        `UPDATE gtm_career_leads
         SET neptune_payload = $1,
             outreach_bite = $2,
             friction_type = COALESCE($3, friction_type),
             funding_signal = $4,
             email = $5,
             contact_recon = $6,
             status = 'Finished'
         WHERE session_id = $7 AND company_name = $8`,
        [
          JSON.stringify(item),
          Outreach_Bite || null,
          nemo_friction_type,
          funding_signal,
          email,
          contact_recon,
          session_id,
          company_name
        ]
      );
      processed.push(session_id);
    }

    return processed;
  } catch (err) {
    throw err;
  }
}

app.post('/api/neptune', async (req, res) => {
  let { leads, session_id, company_name } = req.body;
  
  // Normalization Layer: convert single lead to batch of 1
  if (!leads && session_id) {
    leads = [{ session_id, company_name }];
  }

  if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: 'leads array or session_id required' });
  try {
    const processed = await runNeptuneBulkSynthesis(leads);
    res.json({ status: 'success', processed_count: processed.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reprocess', async (req, res) => {
  const { leads } = req.body;
  if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: 'leads array required' });
  try {
    const processed = await runNeptuneBulkSynthesis(leads);
    res.json({ status: 'reprocessed', processed_count: processed.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/requeue', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT session_id, company_name FROM gtm_career_leads WHERE contact_name IS NULL AND status = 'Finished' LIMIT 50`
    );
    const leads = result.rows.map(r => ({ session_id: r.session_id, company_name: r.company_name }));
    res.json({ leads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fleet agents listening on port ${PORT}`));
