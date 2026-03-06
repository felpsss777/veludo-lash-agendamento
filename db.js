// db.js (SUPABASE / POSTGRES)

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// helpers iguais ao sqlite
async function dbRun(query, params = []) {
  const result = await pool.query(query, params);
  return {
    lastID: result.rows?.[0]?.id || null,
    changes: result.rowCount
  };
}

async function dbGet(query, params = []) {
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

async function dbAll(query, params = []) {
  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = {
  pool,
  dbRun,
  dbGet,
  dbAll
};