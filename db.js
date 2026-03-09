// db.js (SUPABASE / POSTGRES)

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// helpers padrão
async function dbRun(query, params = []) {
  const result = await pool.query(query, params);
  return {
    lastID: result.rows?.[0]?.id || null,
    changes: result.rowCount,
    rows: result.rows
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

// transação real
async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tx = {
      async run(query, params = []) {
        const result = await client.query(query, params);
        return {
          lastID: result.rows?.[0]?.id || null,
          changes: result.rowCount,
          rows: result.rows
        };
      },

      async get(query, params = []) {
        const result = await client.query(query, params);
        return result.rows[0] || null;
      },

      async all(query, params = []) {
        const result = await client.query(query, params);
        return result.rows;
      }
    };

    const result = await callback(tx);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  dbRun,
  dbGet,
  dbAll,
  withTransaction
};