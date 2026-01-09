import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../logger';

const DB_PATH = path.join(process.cwd(), 'data', 'app.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create singleton database connection
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    logger.info({ msg: 'Initializing database connection', path: DB_PATH });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    logger.info({ msg: 'Closing database connection' });
    db.close();
    db = null;
  }
}

// Run migrations on startup
export function runMigrations(): void {
  const database = getDb();
  logger.info({ msg: 'Running database migrations' });

  // Create migrations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    logger.warn({ msg: 'Migrations directory not found', path: migrationsDir });
    return;
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedMigrations = database
    .prepare('SELECT name FROM migrations')
    .all() as { name: string }[];
  const appliedNames = new Set(appliedMigrations.map((m) => m.name));

  for (const file of migrationFiles) {
    if (appliedNames.has(file)) {
      continue;
    }

    logger.info({ msg: 'Applying migration', file });
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    database.exec(sql);
    database.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
  }

  logger.info({ msg: 'Migrations completed' });
}
