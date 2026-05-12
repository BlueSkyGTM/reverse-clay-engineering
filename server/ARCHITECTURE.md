# Fleet Architecture: System Design Spec

## 1. Core Logic
* **Design Pattern:** Modular Asynchronous Fleet.
* **Primary Objective:** Scale lead processing from 15 to 1,500 units per cycle.
* **Concurrency Engine:** `p-limit` for managed parallel execution.

## 2. Directory Structure
* `src/agents/`: Specialized agent logic (Ahab, Nemo, Neptune).
* `src/utils/`: Database pooling (Postgres) and Gemini API wrappers.
* `src/workers/`: `worker_threads` for CPU-intensive JSON mapping.
* `framework/prompts/`: Externalized YAML system instructions.

## 3. Scalability Parameters
* **Batch Size:** 50 leads per workflow trigger (updated from 15).
* **Parallel Factor:** 10 groups of 5 leads (Nemo tier) using `p-limit(10)`.
* **Connection Pool:** `max: 50` for PostgreSQL.
* **Timeout Mitigation:** Parallel execution to stay under 120s for 50-lead batches.

## 4. n8n Integration
* **URL Sanitization:** Internal pre-processing to prevent encoding errors.
* **Resilient Normalization:** Flexible payload handling for `{ leads: [] }`, raw arrays `[]`, or single objects.
* **Payload Normalization:** Item-centric data flow compliance.