// Runs SQL migration files in backend/migrations/ against DB_* from .env
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// MySQL error codes that are safe to ignore on re-runs
const IGNORABLE = new Set([
  1060, // Duplicate column name
  1061, // Duplicate key name
]);

async function main() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.error('No .sql files in migrations/');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      console.log(`→ Applying ${file}...`);
      try {
        await conn.query(sql);
        console.log(`  ✓ ${file}`);
      } catch (err) {
        if (IGNORABLE.has(err.errno)) {
          console.log(`  ⚠ ${file}: ${err.message} (ignored)`);
        } else {
          throw err;
        }
      }
    }
    console.log('✅ Migrations complete.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
