import { ElectronAPI } from '@electron-toolkit/preload'
import type { GerberParseResult, Test, TestSummary } from '../shared/types'

export interface TestsApi {
  create: (testName: string, fileName: string, gerberFileContent: string) => Promise<Test>
  delete: (id: number) => Promise<boolean>
  deleteMany: (ids: number[]) => Promise<number>
  getById: (id: number) => Promise<Test | undefined>
  list: () => Promise<TestSummary[]>
}

export interface ParsingApi {
  parseGerber: (testId: number) => Promise<GerberParseResult>
  renderGerberSvg: (testId: number) => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      tests: TestsApi
      parsing: ParsingApi
    }
  }
}
