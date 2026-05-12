import sys
import json
import re
from urllib.parse import urlparse, quote

def sanitize_url(url):
    """Prevents n8n double-encoding chokes."""
    if not url or not isinstance(url, str):
        return None
    if 'vertexaisearch' in url or 'grounding-api-redirect' in url:
        return None
    try:
        parsed = urlparse(url.strip())
        return f"{parsed.scheme}://{parsed.netloc}{quote(parsed.path)}{parsed.params}{parsed.query}{parsed.fragment}"
    except:
        return url

def strip_citations(val):
    """Strips [1], [2, 3] etc."""
    if not isinstance(val, str):
        return val
    return re.sub(r'\[\d+(?:,\s*\d+)*\]', '', val).strip()

def extract_friction(data):
    """Heuristic search for forensic friction terms."""
    enriched = data.get('Enriched_Lead', {})
    divers = enriched.get('The_Divers', data.get('The_Divers', {}))
    
    candidates = [
        enriched.get('Forensic_Friction_Type'),
        enriched.get('friction_type'),
        divers.get('friction_notes'),
        enriched.get('friction_notes'),
        data.get('friction_type')
    ]

    forensic_terms = ['API Stutter', 'Scale Friction', 'Manual Data Debt', 'Displacement Signal']
    
    for val in candidates:
        if not isinstance(val, str): continue
        for term in forensic_terms:
            if term.lower() in val.lower():
                return term
    return None

def normalize_batch(payload):
    """Normalizes n8n payloads for the server."""
    raw_leads = []
    if isinstance(payload, dict):
        raw_leads = payload.get('leads') or [payload]
    elif isinstance(payload, list):
        raw_leads = payload

    processed = []
    for item in raw_leads:
        data = item.get('json', item) if isinstance(item, dict) else item
        
        sid = data.get('session_id') or data.get('Session_ID')
        cname = data.get('company_name') or data.get('Company_Name')
        
        if sid and cname:
            processed.append({
                "session_id": sid,
                "company_name": cname,
                "email": data.get('email'),
                "friction_type": extract_friction(data)
            })
    return processed

if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        result = normalize_batch(input_data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
