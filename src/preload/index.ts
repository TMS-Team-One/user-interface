import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { GerberParseResult, Test, TestSummary } from '../shared/types'

// Custom APIs for renderer
const api = {
  tests: {
    create: (testName: string, fileName: string, gerberFileContent: string): Promise<Test> =>
      ipcRenderer.invoke('tests:create', testName, fileName, gerberFileContent),
    delete: (id: number): Promise<boolean> => ipcRenderer.invoke('tests:delete', id),
    deleteMany: (ids: number[]): Promise<number> => ipcRenderer.invoke('tests:deleteMany', ids),
    getById: (id: number): Promise<Test | undefined> => ipcRenderer.invoke('tests:getById', id),
    list: (): Promise<TestSummary[]> => ipcRenderer.invoke('tests:list')
  },
  parsing: {
    parseGerber: (testId: number): Promise<GerberParseResult> =>
      ipcRenderer.invoke('parsing:parseGerber', testId),
    renderGerberSvg: (testId: number): Promise<string> =>
      ipcRenderer.invoke('parsing:renderGerberSvg', testId)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error(error)
  }
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
