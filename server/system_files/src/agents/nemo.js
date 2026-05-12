import pLimit from 'p-limit';
import pool from '../utils/db.js';
import { callGenerateContent } from '../utils/gemini.js';
import { NEMO_BULK_SYSTEM } from '../utils/prompts.js';
import { sanitizeUrl, stripCitations, extractFrictionType } from '../utils/parser.js';

const limit = pLimit(10); // Parallel Diving: 10 concurrent tasks as per SOVEREIGN_FLEET_MANUAL

export async function runNemoBulkEnrichment(leads) {
  const validLeads = leads.filter(l => l && l.session_id && l.company_name);
  if (validLeads.length === 0) return 0;

  // 1. Fetch Ahab Payloads
  const query = `
    SELECT session_id, company_name, ahab_payload 
    FROM gtm_career_leads 
    WHERE (session_id, company_name) IN (${validLeads.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`;
  
  const params = validLeads.flatMap(l => [l.session_id, l.company_name]);
  const leadRes = await pool.query(query, params);
  
  if (leadRes.rows.length === 0) return 0;

  // 2. Chunking
  const chunkSize = 5;
  const chunks = [];
  for (let i = 0; i < leadRes.rows.length; i += chunkSize) {
    chunks.push(leadRes.rows.slice(i, i + chunkSize));
  }

  // 3. Parallel Diving
  const tasks = chunks.map(chunk => limit(async () => {
    const batchData = chunk.map(r => ({
      session_id: r.session_id,
      company_name: r.company_name,
      ahab_payload: r.ahab_payload
    }));

    const raw = await callGenerateContent('gemini-1.5-pro', {
      systemInstruction: { parts: [{ text: NEMO_BULK_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(batchData) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 32768,
      },
    });

    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!Array.isArray(result)) return 0;

    for (const item of result) {
      if (item) await updateLeadEnrichment(item);
    }
    return result.length;
  }));

  const results = await Promise.all(tasks);
  return results.reduce((a, b) => a + b, 0);
}

async function updateLeadEnrichment(item) {
  const { session_id, company_name, Enriched_Lead: lead, Nemo_Enrich_Audit: audit } = item;
  if (!session_id || !company_name) return;

  const email = lead?.Contact_Recon?.email || null;
  const contact_name = lead?.Contact_Recon?.name || null;
  
  if (audit?.status === 'SHIPWRECKED') {
    await pool.query(
      'UPDATE gtm_career_leads SET status = \'Shipwrecked\', nemo_payload = $1 WHERE session_id = $2 AND company_name = $3',
      [JSON.stringify(item), session_id, company_name]
    );
    return;
  }

  await pool.query(
    `UPDATE gtm_career_leads
     SET nemo_payload = $1,
         direct_url = COALESCE($2, direct_url),
         status = 'Enriched',
         email = $3,
         contact_name = $4
     WHERE session_id = $5 AND company_name = $6`,
    [
      JSON.stringify(item),
      sanitizeUrl(lead?.Direct_URL),
      email,
      contact_name,
      session_id,
      company_name
    ]
  );
}
