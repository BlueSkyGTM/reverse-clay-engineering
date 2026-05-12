# Context: PAFA Outbound Pipeline

## Objective
Scaling GTM revenue generation from 15 to 1,500 leads per cycle using a modular, asynchronous Fleet Architecture.

## Key Agents
* **Ahab (The Harpooner)**: Discovery & Raw Lead Extraction.
* **Nemo (The Diver)**: Forensic Audit & Enrichment.
* **Neptune (The Shark)**: Outreach Synthesis & JSON Mapping.

## Technical Stack
* **Orchestrator**: n8n (v2.18.5) on Cloud Run.
* **Execution Engine**: Node.js (Express) + Python 3.9+ Hybrid.
* **Data Layer**: PostgreSQL (Cloud SQL).
* **Communication**: Standardized JSON over HTTP (Sovereign Handshake).

## Production Status
* **Infrastructure**: Hardened Docker images (Node + Python runtime).
* **Throughput**: 1,500 leads per cycle (30 batches of 50).
* **Integrity**: Python-native normalization bridge active.
