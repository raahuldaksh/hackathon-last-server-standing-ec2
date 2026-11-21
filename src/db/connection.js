import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

export function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(config.dbPath);

  // Performance-critical SQLite tuning for high-concurrency WAL
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB memory page cache
  db.pragma('busy_timeout = 5000'); // Wait up to 5s if lock contention occurs
  db.pragma('mmap_size = 268435456'); // 256MB memory mapped I/O

  // Execute base schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  dbInstance = db;
  return dbInstance;
}

export function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignored during shutdown
    }
    dbInstance = null;
  }
}
