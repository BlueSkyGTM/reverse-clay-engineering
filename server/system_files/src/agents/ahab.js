import pool from '../utils/db.js';
import { callGenerateContent } from '../utils/gemini.js';
import { extractJson, sanitizeUrl } from '../utils/parser.js';
import { AHAB_SYSTEM } from '../utils/prompts.js';

const AGGREGATORS = new Set(['jobgether', 'jobsora', 'indeed', 'glassdoor', 'linkedin', 'ziprecruiter']);

export async function runAhabDiscovery(message) {
  const raw = await callGenerateContent('gemini-2.5-pro', {
    systemInstruction: { parts: [{ text: AHAB_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: message }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 32768,
    },
  });

  const result = extractJson(raw);
  if (!result) throw new Error('Ahab discovery failed: model returned null or invalid JSON');
  
  const session_ids = [];

  if (result.Catch && Array.isArray(result.Catch)) {

    // Process each catch item
    for (const lead of result.Catch) {
      const company_name = lead.Company_Name || lead.company_name || '';
      const name_lower = company_name.toLowerCase().trim();
      
      if (!name_lower || name_lower === 'unknown' || AGGREGATORS.has(name_lower)) continue;
      
      const session_id = 'lead_' + company_name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const sanitizedUrl = sanitizeUrl(lead.Job_URL);

      await pool.query(
        `INSERT INTO gtm_career_leads (session_id, company_name, ahab_payload, direct_url, job_url, status)
         VALUES ($1, $2, $3, $4, $5, 'Scraped')
         ON CONFLICT (session_id, company_name)
         DO UPDATE SET
           ahab_payload = EXCLUDED.ahab_payload,
           job_url = EXCLUDED.job_url,
           status = 'Scraped'
         WHERE gtm_career_leads.status = 'Scraped'`,
        [session_id, company_name, JSON.stringify(lead), sanitizedUrl, sanitizedUrl]
      );
      session_ids.push(session_id);
    }
  }

  return { session_ids, harpooner_logs: result.Harpooner_Logs || [] };
}

export async function seedCompanies(companies) {
  const session_ids = [];
  for (const entry of companies) {
    const company_name = entry.company_name || '';
    const name_lower = company_name.toLowerCase().trim();
    if (!name_lower || name_lower === 'unknown' || AGGREGATORS.has(name_lower)) continue;
    
    const session_id = 'lead_' + company_name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const job_url = sanitizeUrl(entry.job_url || null);
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
  return session_ids;
}
