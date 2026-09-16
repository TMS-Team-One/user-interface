import type { Test, TestSummary } from '../../shared/types'
import { getDb } from './client'

export function createTest(testName: string, fileName: string, gerberFileContent: string): Test {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO tests (testName, fileName, gerberFileContent) VALUES (?, ?, ?)')
    .run(testName, fileName, gerberFileContent)

  return getTestById(lastInsertRowid as number) as Test
}

export function deleteTest(id: number): boolean {
  const db = getDb()
  const { changes } = db.prepare('DELETE FROM tests WHERE id = ?').run(id)
  return changes > 0
}

export function deleteTests(ids: number[]): number {
  if (ids.length === 0) return 0

  const db = getDb()
  const placeholders = ids.map(() => '?').join(', ')
  const { changes } = db
    .prepare(`DELETE FROM tests WHERE id IN (${placeholders})`)
    .run(...ids)
  return changes
}

export function getTestById(id: number): Test | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM tests WHERE id = ?').get(id) as Test | undefined
}

export function listTests(): TestSummary[] {
  const db = getDb()
  return db
    .prepare('SELECT id, testName, createdAt, fileName FROM tests ORDER BY createdAt DESC')
    .all() as TestSummary[]
}
