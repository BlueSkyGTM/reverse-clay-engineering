-- Fleet Framework: Campaign Table Template
-- Replace {{campaign_output_table}} with your actual table name before running.
-- This template is tool-agnostic  works with any Postgres-compatible database.

-- ==========================================
-- OUTPUT TABLE (enriched leads)
-- ==========================================

CREATE TABLE IF NOT EXISTS {{campaign_output_table}} (
    id SERIAL PRIMARY KEY,
    "Company_Name" VARCHAR(255) UNIQUE NOT NULL,
    "Direct_URL" TEXT,
    "Target_Service_Intent" VARCHAR(100),
    "Email" VARCHAR(255),
    "Outreach_Bite" TEXT,
    "Contact_Recon" TEXT,
    "funding_signal" TEXT,
    "Status" VARCHAR(50) DEFAULT 'Enriched',
    reviewed BOOLEAN DEFAULT FALSE,
    outreach_date DATE,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- STAGING TABLE (optional  bulk input campaigns only)
-- Use this if your campaign ingests a pre-sourced list instead of running live discovery.
-- Ahab-driven campaigns do not need this table.
-- ==========================================

CREATE TABLE IF NOT EXISTS {{campaign_staging_table}} (
    id SERIAL PRIMARY KEY,
    "Company_Name" VARCHAR(255) UNIQUE NOT NULL,
    -- Add columns matching your source data here
    processed BOOLEAN DEFAULT FALSE,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_{{campaign_staging_table}}_processed
    ON {{campaign_staging_table}}(processed);

-- ==========================================
-- SHARED INFRASTRUCTURE (run once per database  skip if already exists)
-- ==========================================

-- Cross-agent session memory (Postgres Chat Memory node)
CREATE TABLE IF NOT EXISTS fleet_memory (
    id SERIAL PRIMARY KEY,
    "sessionId" VARCHAR(255) NOT NULL,
    message JSONB NOT NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fleet_memory_session ON fleet_memory("sessionId");

-- Error log and lesson ledger
CREATE TABLE IF NOT EXISTS fleet_errors (
    id SERIAL PRIMARY KEY,
    node_name VARCHAR(255),
    error_message TEXT,
    stack_trace TEXT,
    attempted_fix TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fleet_errors_resolved ON fleet_errors(resolved);

-- Workflow registry (anti-drift)
CREATE TABLE IF NOT EXISTS fleet_workflows (
    id SERIAL PRIMARY KEY,
    workflow_name VARCHAR(255) UNIQUE NOT NULL,
    version VARCHAR(50) NOT NULL,
    n8n_workflow_id VARCHAR(100),
    last_deployed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum TEXT
);
