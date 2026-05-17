import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from './migrate';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;
  const dir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'funds.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  instance = db;
  return db;
}
