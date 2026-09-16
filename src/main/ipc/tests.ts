import { ipcMain } from 'electron'
import { createTest, deleteTest, deleteTests, getTestById, listTests } from '../db/tests.repository'

export function registerTestsIpc(): void {
  ipcMain.handle(
    'tests:create',
    (_event, testName: string, fileName: string, gerberFileContent: string) => {
      try {
        return createTest(testName, fileName, gerberFileContent)
      } catch (error) {
        console.error('tests:create failed', error)
        throw error
      }
    }
  )

  ipcMain.handle('tests:delete', (_event, id: number) => deleteTest(id))

  ipcMain.handle('tests:deleteMany', (_event, ids: number[]) => deleteTests(ids))

  ipcMain.handle('tests:getById', (_event, id: number) => getTestById(id))

  ipcMain.handle('tests:list', () => listTests())
}
