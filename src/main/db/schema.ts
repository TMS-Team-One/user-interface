import type Database from 'better-sqlite3'
import { identifyFile } from '../../shared/file-kinds'

/** Brings the database up to the current schema. Runs on every start; a no-op once up to date. */
export function migrate(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version < 1) db.transaction(() => migrateToV1(db))()
}

function migrateToV1(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      pose TEXT
    );
    CREATE TABLE IF NOT EXISTS project_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      fileName TEXT NOT NULL,
      kind TEXT NOT NULL,
      layerType TEXT,
      layerSide TEXT,
      content TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_models (
      projectId INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      meshes BLOB NOT NULL
    );
  `)

  // Before projects existed, a "test case" held exactly one Gerber file in the
  // tests table. Carry those over as single-file projects.
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all()
  if (tables.includes('tests')) {
    const legacyRows = db
      .prepare('SELECT testName, createdAt, fileName, gerberFileContent FROM tests ORDER BY id')
      .all() as Array<{
      testName: string
      createdAt: string
      fileName: string
      gerberFileContent: string
    }>
    const insertProject = db.prepare('INSERT INTO projects (name, createdAt) VALUES (?, ?)')
    const insertFile = db.prepare(
      'INSERT INTO project_files (projectId, fileName, kind, layerType, layerSide, content) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const row of legacyRows) {
      const { lastInsertRowid } = insertProject.run(row.testName, row.createdAt)
      const { kind, layerType, layerSide } = identifyFile(row.fileName, row.gerberFileContent)
      insertFile.run(
        lastInsertRowid,
        row.fileName,
        kind,
        layerType,
        layerSide,
        row.gerberFileContent
      )
    }
    db.exec('DROP TABLE tests')
  }

  db.pragma('user_version = 1')
}
