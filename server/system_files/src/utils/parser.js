/**
 * Sanitizes URLs to prevent n8n "double-encoding" chokes.
 * Uses encodeURIComponent on the path while preserving the protocol and host.
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.includes('vertexaisearch') || url.includes('grounding-api-redirect')) return null;
  
  try {
    const parsed = new URL(url.trim());
    // n8n compliance: pre-encoding the path to avoid double-encoding in HTTP nodes
    return `${parsed.protocol}//${parsed.host}${encodeURI(parsed.pathname)}${parsed.search}${parsed.hash}`;
  } catch (e) {
    return url; // Fallback to raw if not a valid URL
  }
}

/**
 * Strips bracketed citations [1], [2, 3] from strings.
 */
export function stripCitations(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim();
}

/**
 * Extracts JSON from a potentially markdown-wrapped model response.
 */
export function extractJson(raw) {
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
        throw new Error(`Failed to parse extracted JSON: ${innerError.message}`);
      }
    }
    throw new Error('No valid JSON structure found in response');
  }
}

/**
 * Extracts specific forensic friction types from the payload.
 */
export function extractFrictionType(payload) {
  const lead = payload?.Enriched_Lead || payload || {};
  const divers = lead.The_Divers || payload?.The_Divers || {};
  
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
    const found = forensicTerms.find(term => val.toLowerCase().includes(term.toLowerCase()));
    if (found) return found;
    if (serviceIntents.some(intent => val.trim().toUpperCase() === intent)) continue;
    if (forensicTerms.includes(val.trim())) return val.trim();
  }

  return null;
}

/**
 * Extracts funding signals from various nested properties.
 */
export function extractFundingSignal(payload) {
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

/**
 * Normalizes Nemo payload for outreach synthesis.
 */
export function normalizeNemoPayload(payload) {
  const email = 
    payload?.Contact_Recon?.email || 
    payload?.Contact_Recon?.email_pattern || 
    payload?.Contact_Recon?.email_pattern_guess || 
    payload?.contact_recon?.email || 
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
