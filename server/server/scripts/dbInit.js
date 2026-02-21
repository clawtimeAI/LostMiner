require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Example: postgres://postgres:***@localhost:5432/aigame');
    process.exit(1);
  }
  const sqlPath = path.resolve(__dirname, '../../../docs/db/schema.postgres.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  // Ensure database exists; if not, create it by connecting to 'postgres'
  let client;
  try {
    client = new Client({ connectionString: url });
    await client.connect();
  } catch (e) {
    const u = new URL(url);
    const dbName = u.pathname.replace(/^\//, '');
    const adminUrl = new URL(url);
    adminUrl.pathname = '/postgres';
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
      if (exists.rowCount === 0) {
        await admin.query(`CREATE DATABASE "${dbName}"`);
        console.log(`[db] created database ${dbName}`);
      } else {
        console.log(`[db] database ${dbName} already exists`);
      }
    } finally {
      await admin.end();
    }
    client = new Client({ connectionString: url });
    await client.connect();
  }
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[db] schema initialized successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[db] init error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
