import fs from 'fs';
import Database from 'better-sqlite3';

const db = new Database('database.sqlite');
const tables = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all() as { name: string; sql: string }[];

let schemaSql = '-- ==========================================\n-- Cloudflare D1 Database Schema for SUMAS\n-- ==========================================\n\n';
let seedSql = '-- ==========================================\n-- Cloudflare D1 Initial Dynamic Data for SUMAS\n-- ==========================================\n\n';

for (const t of tables) {
  const safeCreateSql = t.sql.replace(/^CREATE TABLE\s+(?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ');
  schemaSql += safeCreateSql + ';\n\n';
}

const indexes = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")
  .all() as { sql: string }[];
for (const idx of indexes) {
  const safeIdxSql = idx.sql.replace(/^CREATE( UNIQUE)? INDEX\s+(?!IF NOT EXISTS)/i, 'CREATE$1 INDEX IF NOT EXISTS ');
  schemaSql += safeIdxSql + ';\n';
}

fs.mkdirSync('d1', { recursive: true });
fs.writeFileSync('d1/schema.sql', schemaSql, 'utf8');

// Jangan pernah mengekspor sesi aktif atau rahasia kriptografis lokal ke berkas seed SQL
const EXCLUDED_SEED_TABLES = new Set(['user_sessions', 'server_secrets']);

for (const t of tables) {
  if (EXCLUDED_SEED_TABLES.has(t.name)) continue;
  const rows = db.prepare('SELECT * FROM ' + t.name).all() as any[];
  if (rows.length === 0) continue;

  seedSql += '\n-- Data for table ' + t.name + ' (' + rows.length + ' rows)\n';
  for (const r of rows) {
    const cols = Object.keys(r);
    const vals = cols.map((c) => {
      const v = r[c];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return v;
      return "'" + String(v).replace(/'/g, "''") + "'";
    });
    seedSql += 'INSERT OR REPLACE INTO ' + t.name + ' (' + cols.join(', ') + ') VALUES (' + vals.join(', ') + ');\n';
  }
}

fs.writeFileSync('d1/seed.sql', seedSql, 'utf8');
console.log('Successfully generated d1/schema.sql and d1/seed.sql');
