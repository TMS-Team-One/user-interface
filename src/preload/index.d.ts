import { ElectronAPI } from '@electron-toolkit/preload'
import type { Test, TestSummary } from '../shared/types'

export interface TestsApi {
  create: (testName: string, fileName: string, gerberFileContent: string) => Promise<Test>
  delete: (id: number) => Promise<boolean>
  getById: (id: number) => Promise<Test | undefined>
  list: () => Promise<TestSummary[]>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      tests: TestsApi
    }
  }
}
