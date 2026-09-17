import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ChatEventEnvelope,
  ChatResult,
  ChatSendRequest,
  GerberParseResult,
  ManualProbeCoordinates,
  ManualProbeResult,
  ProbeConnectionStatus,
  Test,
  TestSummary
} from '../shared/types'

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

export interface ProbeApi {
  connect: () => Promise<ProbeConnectionStatus>
  status: () => Promise<ProbeConnectionStatus>
  disconnect: () => Promise<ProbeConnectionStatus>
  home: () => Promise<ProbeConnectionStatus>
  runManualTest: (coordinates: ManualProbeCoordinates) => Promise<ManualProbeResult>
}

export interface ChatApi {
  history: (testId: number) => Promise<ChatResult>
  send: (request: ChatSendRequest) => Promise<ChatResult>
  onEvent: (callback: (event: ChatEventEnvelope) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      tests: TestsApi
      parsing: ParsingApi
      probe: ProbeApi
      chat: ChatApi
    }
  }
}
