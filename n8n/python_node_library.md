# Sovereign Python Library: GTM Fleet Protocol

This library codifies the **SOVEREIGN_FLEET_MANUAL** into a resilient Python-native architecture, replacing the unstable JavaScript "Item-Centric" logic.

## 1. Core Module (`sovereign_fleet/core.py`)
This handles payload normalization and parallel execution.

```python
import asyncio
from typing import List, Dict, Any, Union

class SovereignFleet:
    """
    The Master Protocol engine for 1,500-lead GTM operations.
    Converts JS 'p-limit' logic into Python-native Asyncio Semaphores.
    """
    
    @staticmethod
    def normalize_payload(payload: Union[Dict, List]) -> List[Dict]:
        """
        The 'Zero-Bug Fix' ported to Python. 
        Handles nested n8n objects, raw arrays, and case-insensitive keys.
        """
        raw_leads = []
        if isinstance(payload, dict):
            # Check for 'leads' key, or assume the dict itself is a single lead
            raw_leads = payload.get('leads') or payload.get('Leads') or [payload]
        elif isinstance(payload, list):
            raw_leads = payload
            
        processed = []
        for item in raw_leads:
            # Reach into n8n .json wrapper if present
            data = item.get('json', item) if isinstance(item, dict) else item
            
            # Key recovery: session_id and company_name
            sid = data.get('session_id') or data.get('Session_ID')
            cname = data.get('company_name') or data.get('Company_Name')
            
            if sid and cname:
                processed.append({"session_id": sid, "company_name": cname})
        return processed

    @staticmethod
    def chunk_leads(leads: List[Dict], size: int = 5) -> List[List[Dict]]:
        """Splits the 50-lead batch into manageable chunks for AI reasoning."""
        return [leads[i:i + size] for i in range(0, len(leads), size)]

    async def execute_parallel(self, tasks, concurrency_limit: int):
        """Python implementation of JS p-limit(n)."""
        semaphore = asyncio.Semaphore(concurrency_limit)
        
        async def sem_task(task):
            async with semaphore:
                return await task
        
        return await asyncio.gather(*(sem_task(t) for t in tasks))
```

## 2. Agent Tier Configurations (`sovereign_fleet/agents.py`)
Standardizes temperatures and concurrency limits.

```python
from dataclasses import dataclass

@dataclass
class AgentConfig:
    name: str
    temp: float
    concurrency: int
    system_prompt: str

# Protocol-Locked Configurations
AHAB = AgentConfig(
    name="Ahab",
    temp=0.1,
    concurrency=1, # Single-pass discovery
    system_prompt="ahab_system.yaml"
)

NEMO = AgentConfig(
    name="Nemo",
    temp=0.1,
    concurrency=10, # Parallel Diving
    system_prompt="nemo_system.yaml"
)

NEPTUNE = AgentConfig(
    name="Neptune",
    temp=0.7,
    concurrency=15, # Parallel Biting
    system_prompt="neptune_system.yaml"
)
```

## 3. n8n Python Node Template
The "Master Parse Code" for the n8n Code (Python) node.

```python
# SOVEREIGN PYTHON PARSE NODE
# Note: Ensure sovereign_fleet is available in the environment

# 1. Initialize Fleet Engine
leads_data = _input.all() # n8n native input

# 2. Extract 50 leads with forensic precision
processed = []
for item in leads_data:
    data = item.json
    sid = data.get('session_id') or data.get('Session_ID')
    cname = data.get('company_name') or data.get('Company_Name')
    if sid and cname:
        processed.append({"session_id": sid, "company_name": cname})

# 3. Enforce Batch Integrity (SOVEREIGN_FLEET_MANUAL Node 3)
batch = processed[:50] 

# 4. Return as a single n8n-compatible item
return {
    "leads": batch,
    "batch_size": len(batch)
}
```
