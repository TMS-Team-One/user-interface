import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  BoardPose,
  BoardRender,
  ChatReply,
  ChatTurn,
  FileClassification,
  GerberParseResult,
  LiveEvent,
  LocalisationResult,
  PrinterPosition,
  Project,
  ProjectFile,
  ProjectSummary
} from '../shared/types'

export interface ProjectsApi {
  create: (name: string, files: ProjectFile[]) => Promise<ProjectSummary>
  delete: (id: number) => Promise<boolean>
  deleteMany: (ids: number[]) => Promise<number>
  getById: (id: number) => Promise<Project | undefined>
  list: () => Promise<ProjectSummary[]>
  getModel: (id: number) => Promise<ArrayBuffer | null>
  getPose: (id: number) => Promise<BoardPose | null>
}

export interface VisionApi {
  locateBoard: (
    projectId: number,
    frame: ArrayBuffer,
    outline: [number, number][]
  ) => Promise<{ result: LocalisationResult; annotated: ArrayBuffer }>
  lastLocalisation: (projectId: number) => Promise<LocalisationResult | null>
  printerPosition: () => Promise<PrinterPosition>
  syncPose: (projectId: number, featureId: number, printer: PrinterPosition) => Promise<BoardPose>
}

export interface ChatApi {
  send: (projectId: number, messages: ChatTurn[]) => Promise<ChatReply>
}

export interface ParsingApi {
  parsePads: (projectId: number) => Promise<GerberParseResult>
  renderBoard: (projectId: number) => Promise<BoardRender>
  classifyFile: (fileName: string, head: string) => Promise<FileClassification | null>
}

export interface LiveApi {
  start: (projectId: number) => Promise<number>
  stop: () => Promise<void>
  whep: (url: string, offerSdp: string) => Promise<string>
  onEvent: (listener: (event: LiveEvent) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      projects: ProjectsApi
      parsing: ParsingApi
      live: LiveApi
      vision: VisionApi
      chat: ChatApi
    }
  }
}
