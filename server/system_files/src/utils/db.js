import pg from 'pg';
const { Pool } = pg;

// Optimized for 50 concurrent leads as per SOVEREIGN_FLEET_MANUAL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50, 
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[Postgres Pool Error]:', err.message);
});

export default pool;
