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
  const dbName = process.env.DB_NAME || 'aguadoc';
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
    database: dbName,
    multipleStatements: true,
  });

  console.log(`Using database: ${dbName}`);

  try {
    for (const file of files) {
      let sql = fs.readFileSync(path.join(dir, file), 'utf8');
      // Force migrations onto the configured DB (Hostinger name may differ from "aguadoc")
      sql = sql.replace(/^\s*USE\s+[`']?[\w]+[`']?\s*;/gim, `USE \`${dbName}\`;`);

      console.log(`→ Applying ${file}...`);
      try {
        await conn.query(sql);
        console.log(`  ✓ ${file}`);
      } catch (err) {
        // Strip -- comments first (comments may contain ';'), then split statements.
        const withoutComments = sql
          .split('\n')
          .map((line) => line.replace(/--.*$/, ''))
          .join('\n');
        const statements = withoutComments
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        if (statements.length <= 1) {
          if (IGNORABLE.has(err.errno)) {
            console.log(`  ⚠ ${file}: ${err.message} (ignored)`);
            continue;
          }
          throw err;
        }

        console.log(`  ⚠ ${file}: batch failed (${err.message}) — retrying per statement`);
        for (const stmt of statements) {
          try {
            await conn.query(stmt);
          } catch (inner) {
            if (IGNORABLE.has(inner.errno)) {
              console.log(`    · ignored: ${inner.message}`);
            } else {
              throw inner;
            }
          }
        }
        console.log(`  ✓ ${file} (per-statement)`);
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
