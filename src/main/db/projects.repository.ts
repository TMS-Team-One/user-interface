import type {
  BoardPose,
  Project,
  ProjectFile,
  ProjectFileSummary,
  ProjectSummary,
  StoredProjectFile
} from '../../shared/types'
import { getDb } from './client'

export function createProject(name: string, files: ProjectFile[]): ProjectSummary {
  const db = getDb()
  const insertFile = db.prepare(
    'INSERT INTO project_files (projectId, fileName, kind, layerType, layerSide, content) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const id = db.transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name)
    for (const file of files) {
      insertFile.run(
        lastInsertRowid,
        file.fileName,
        file.kind,
        file.layerType,
        file.layerSide,
        file.content
      )
    }
    return lastInsertRowid as number
  })()

  return listProjects().find((project) => project.id === id) as ProjectSummary
}

export function deleteProject(id: number): boolean {
  const db = getDb()
  const { changes } = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return changes > 0
}

export function deleteProjects(ids: number[]): number {
  if (ids.length === 0) return 0

  const db = getDb()
  const placeholders = ids.map(() => '?').join(', ')
  const { changes } = db.prepare(`DELETE FROM projects WHERE id IN (${placeholders})`).run(...ids)
  return changes
}

export function getProjectById(id: number): Project | undefined {
  const db = getDb()
  const project = db.prepare('SELECT id, name, createdAt FROM projects WHERE id = ?').get(id) as
    Omit<ProjectSummary, 'files'> | undefined
  if (!project) return undefined

  const files = db
    .prepare(
      'SELECT id, fileName, kind, layerType, layerSide, content FROM project_files WHERE projectId = ? ORDER BY id'
    )
    .all(id) as StoredProjectFile[]
  return { ...project, files }
}

/** The project with this id, or an error naming it when there is none. */
export function requireProject(id: number): Project {
  const project = getProjectById(id)
  if (!project) {
    throw new Error(`No project found with id ${id}`)
  }
  return project
}

export function listProjects(): ProjectSummary[] {
  const db = getDb()
  const projects = db
    .prepare('SELECT id, name, createdAt FROM projects ORDER BY createdAt DESC, id DESC')
    .all() as Array<Omit<ProjectSummary, 'files'>>
  const files = db
    .prepare('SELECT projectId, fileName, kind FROM project_files ORDER BY id')
    .all() as Array<ProjectFileSummary & { projectId: number }>
  return projects.map((project) => ({
    ...project,
    files: files
      .filter((file) => file.projectId === project.id)
      .map(({ fileName, kind }) => ({ fileName, kind }))
  }))
}

/** Where the board lies on the bed, from the camera sync; null until synced. */
export function getProjectPose(projectId: number): BoardPose | null {
  const row = getDb().prepare('SELECT pose FROM projects WHERE id = ?').get(projectId) as
    { pose: string | null } | undefined
  return row?.pose ? (JSON.parse(row.pose) as BoardPose) : null
}

export function saveProjectPose(projectId: number, pose: BoardPose): void {
  getDb().prepare('UPDATE projects SET pose = ? WHERE id = ?').run(JSON.stringify(pose), projectId)
}

export function saveProjectModel(projectId: number, meshes: Buffer): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO project_models (projectId, meshes) VALUES (?, ?)')
    .run(projectId, meshes)
}

export function getProjectModel(projectId: number): Buffer | null {
  const row = getDb()
    .prepare('SELECT meshes FROM project_models WHERE projectId = ?')
    .get(projectId) as { meshes: Buffer } | undefined
  return row?.meshes ?? null
}
