const { Pool } = require('pg');

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[db] DATABASE_URL not set. Database features will be disabled.');
    return null;
  }
  const pool = new Pool({ connectionString });
  return pool;
}

module.exports = { createPool };

