# PAFA Systems Design (Nitro Refactoring)

## 1. Vision
PAFA: Pipeline As File Architecture. We do not build pipelines in GUIs; we define revenue streams as modular, version-controlled code.

## 2. Workspace Structure
* `pafa-outbound-pipeline/`: The production engine (formerly `system_files/`).
* `framework/`: Decoupled system prompts.
* `infra/`: Infrastructure as Code (n8n/Cloud Run definitions).
* `docs/`: Master Protocols and Fallback Strategies.

## 3. Core Principles
1. **The Handshake**: n8n is the Trigger (Orchestrator); the Server is the Brain (Execution).
2. **Batch Integrity**: Always process in batches of 50 leads.
3. **Resilience**: Every ingest must pass through the Python Bridge (`parser.py`).
4. **Concurrency**: Nemo (10x), Neptune (15x).

## 4. Operating Procedures
- **Deployment**: Always use `bash deploy.sh` for production sync.
- **Troubleshooting**: Consult `PLAN_B_MANAGED_FALLBACK.md` before manual database interventions.
- **Modification**: All changes must be reflected in `ARCHITECTURE.md` within `docs/`.
