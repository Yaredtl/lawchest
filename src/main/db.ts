import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { localDir } from './config'

let db: DatabaseSync | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  folder TEXT NOT NULL UNIQUE,
  fields TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ingreso', 'gasto')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  date TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_client ON movements(client_id);
CREATE TABLE IF NOT EXISTS trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  client_id INTEGER,
  client_name TEXT,
  original_path TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  size INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** Copia de trabajo local de la base de datos (nunca dentro de la carpeta sincronizada) */
export const workingDbPath = (): string => join(localDir(), 'trabajo.db')

export function applySchema(d: DatabaseSync): void {
  d.exec('PRAGMA foreign_keys = ON;')
  d.exec(SCHEMA)
}

export function openDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(workingDbPath())
  db.exec('PRAGMA journal_mode = WAL;')
  applySchema(db)
  return db
}

export function getDb(): DatabaseSync {
  return db ?? openDb()
}

export function isDbOpen(): boolean {
  return db !== null
}

export function closeDb(): void {
  if (db) {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
    } catch {
      /* ignorar */
    }
    db.close()
    db = null
  }
}

export const nowIso = (): string => new Date().toISOString()

/** Ejecuta fn dentro de una transacción */
export function tx<T>(fn: () => T): T {
  const d = getDb()
  d.exec('BEGIN')
  try {
    const r = fn()
    d.exec('COMMIT')
    return r
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}
