import { ipcMain } from 'electron'
import type { ProjectFile } from '../../shared/types'
import {
  createProject,
  deleteProject,
  deleteProjects,
  getProjectById,
  getProjectModel,
  getProjectPose,
  listProjects,
  saveProjectModel
} from '../db/projects.repository'
import { convertStep } from '../step/convert-step'

export function registerProjectsIpc(): void {
  ipcMain.handle('projects:create', async (_event, name: string, files: ProjectFile[]) => {
    try {
      const project = createProject(name, files)
      // A STEP model is converted once, here; the 3D view reads the stored meshes.
      const step = files.find((file) => file.kind === 'step')
      if (step) {
        try {
          saveProjectModel(project.id, await convertStep(step.content))
        } catch (error) {
          console.error('STEP conversion failed', error)
        }
      }
      return project
    } catch (error) {
      console.error('projects:create failed', error)
      throw error
    }
  })

  ipcMain.handle('projects:delete', (_event, id: number) => deleteProject(id))

  ipcMain.handle('projects:deleteMany', (_event, ids: number[]) => deleteProjects(ids))

  ipcMain.handle('projects:getById', (_event, id: number) => getProjectById(id))

  ipcMain.handle('projects:list', () => listProjects())

  ipcMain.handle('projects:getPose', (_event, id: number) => getProjectPose(id))

  ipcMain.handle('projects:getModel', (_event, id: number) => {
    const model = getProjectModel(id)
    return model ? model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength) : null
  })
}
