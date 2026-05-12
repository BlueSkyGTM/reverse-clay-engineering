import pLimit from 'p-limit';
import pool from '../utils/db.js';
import { callGenerateContent } from '../utils/gemini.js';
import { NEPTUNE_BULK_SYSTEM } from '../utils/prompts.js';

const limit = pLimit(15); // Parallel Biting: 15 concurrent synthesis tasks as per SOVEREIGN_FLEET_MANUAL

export async function runNeptuneBulkSynthesis(leads) {
  const validLeads = leads.filter(l => l && l.session_id && l.company_name);
  if (validLeads.length === 0) return 0;

  // 1. Fetch Nemo Payloads
  const query = `
    SELECT nemo_payload, company_name, session_id 
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

  // 3. Parallel Biting
  const tasks = chunks.map(chunk => limit(async () => {
    const batchData = chunk.map(r => ({
      session_id: r.session_id,
      company_name: r.company_name,
      nemo_payload: r.nemo_payload
    }));

    const raw = await callGenerateContent('gemini-1.5-flash', {
      systemInstruction: { parts: [{ text: NEPTUNE_BULK_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(batchData) }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 32768,
      },
    });

    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!Array.isArray(result)) return 0;

    for (const item of result) {
      await updateLeadSynthesis(item);
    }
    return result.length;
  }));

  const results = await Promise.all(tasks);
  return results.reduce((a, b) => a + b, 0);
}

async function updateLeadSynthesis(item) {
  const { session_id, company_name, Outreach_Bite } = item;
  await pool.query(
    `UPDATE gtm_career_leads
     SET neptune_payload = $1,
         outreach_bite = $2,
         status = 'Finished'
     WHERE session_id = $3 AND company_name = $4`,
    [
      JSON.stringify(item),
      Outreach_Bite || null,
      session_id,
      company_name
    ]
  );
}
