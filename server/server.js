import 'dotenv/config';
import express from 'express';
import pool from './src/utils/db.js';
import { runNemoBulkEnrichment } from './src/agents/nemo.js';
import { runNeptuneBulkSynthesis } from './src/agents/neptune.js';
import { runPythonScript } from './src/utils/python.js';

const app = express();
app.use(express.json({ limit: '50mb' }));

/**
 * Nemo Enrichment (The Divers)
 * Uses Python bridge for resilient payload normalization.
 */
app.post('/api/nemo', async (req, res) => {
  try {
    const leads = await runPythonScript('./src/utils/parser.py', req.body);
    if (!leads || !leads.length) {
      return res.status(400).json({ error: 'No valid leads found by Python parser', received: req.body });
    }
    const count = await runNemoBulkEnrichment(leads);
    res.json({ status: 'success', processed_count: count });
  } catch (err) {
    console.error('[Nemo Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Neptune Synthesis (The Sharks)
 * Uses Python bridge for resilient payload normalization.
 */
app.post('/api/neptune', async (req, res) => {
  try {
    const leads = await runPythonScript('./src/utils/parser.py', req.body);
    if (!leads || !leads.length) {
      return res.status(400).json({ error: 'No valid leads found by Python parser', received: req.body });
    }
    const count = await runNeptuneBulkSynthesis(leads);
    res.json({ status: 'success', processed_count: count });
  } catch (err) {
    console.error('[Neptune Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Utility: SQL Intake (Requeue)
 * Pulls a batch of 50 leads ready for enrichment.
 */
app.post('/api/requeue', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT session_id, company_name FROM gtm_career_leads WHERE contact_name IS NULL AND status = 'Scraped' LIMIT 50"
    );
    res.json({ leads: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 FLEET ENGINE ACTIVE ON PORT ${PORT}`);
  console.log('📡 Optimized for 1,500 lead cycle (Python Handshake Active)\n');
});
