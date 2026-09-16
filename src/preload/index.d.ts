import { ElectronAPI } from '@electron-toolkit/preload'
import type { ParsedPad, ProbeConnectionStatus, Test, TestSummary } from '../shared/types'

export interface TestsApi {
  create: (testName: string, fileName: string, gerberFileContent: string) => Promise<Test>
  delete: (id: number) => Promise<boolean>
  getById: (id: number) => Promise<Test | undefined>
  list: () => Promise<TestSummary[]>
}

export interface ParsingApi {
  parseGerber: (testId: number) => Promise<ParsedPad[]>
  renderGerberSvg: (testId: number) => Promise<string>
}

export interface ProbeApi {
  connect: () => Promise<ProbeConnectionStatus>
  status: () => Promise<ProbeConnectionStatus>
  disconnect: () => Promise<ProbeConnectionStatus>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      tests: TestsApi
      parsing: ParsingApi
      probe: ProbeApi
    }
  }
}
