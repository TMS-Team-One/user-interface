import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  db = new Database(join(app.getPath('userData'), 'app.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      testName TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      fileName TEXT NOT NULL,
      gerberFileContent TEXT NOT NULL
    )
  `)

  return db
}
