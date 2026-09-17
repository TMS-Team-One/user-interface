import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { migrate } from './schema'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  db = new Database(join(app.getPath('userData'), 'app.db'))
  db.pragma('journal_mode = WAL')
  // Makes ON DELETE CASCADE work; SQLite leaves it off per connection by default.
  db.pragma('foreign_keys = ON')
  migrate(db)

  return db
}
