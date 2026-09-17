import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  BoardPose,
  BoardRender,
  CameraRegistration,
  ChatEventEnvelope,
  ChatResult,
  ChatSendRequest,
  FileClassification,
  GerberParseResult,
  JogStep,
  LiveEvent,
  LocalisationResult,
  ManualProbeCoordinates,
  PrinterPosition,
  ProbeConnectionStatus,
  ProbeResult,
  PrinterPose,
  Project,
  ProjectFile,
  ProjectSummary,
  SheetTouch,
  SheetView,
  VoltageReading
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
    frames: ArrayBuffer[],
    outline: [number, number][]
  ) => Promise<{ result: LocalisationResult; annotated: ArrayBuffer }>
  lastLocalisation: (projectId: number) => Promise<LocalisationResult | null>
  printerPosition: () => Promise<PrinterPosition>
  registration: () => Promise<CameraRegistration>
  calibrateCamera: (frames: ArrayBuffer[], bedZs: number[]) => Promise<CameraRegistration>
  registerSheet: (touches: SheetTouch[]) => Promise<CameraRegistration>
  detectSheet: (frame: ArrayBuffer) => Promise<SheetView>
  boardPose: (projectId: number, zContact: number) => Promise<PrinterPose>
  syncPose: (projectId: number, featureId: number, printer: PrinterPosition) => Promise<BoardPose>
}

export interface ProbeApi {
  connect: () => Promise<ProbeConnectionStatus>
  status: () => Promise<ProbeConnectionStatus>
  disconnect: () => Promise<ProbeConnectionStatus>
  home: () => Promise<ProbeConnectionStatus>
  measure: () => Promise<VoltageReading>
  probeAt: (coordinates: ManualProbeCoordinates) => Promise<ProbeResult>
  move: (coordinates: ManualProbeCoordinates) => Promise<PrinterPosition>
  jog: (step: JogStep) => Promise<PrinterPosition>
}

export interface ChatApi {
  history: (projectId: number) => Promise<ChatResult>
  send: (request: ChatSendRequest) => Promise<ChatResult>
  onEvent: (listener: (envelope: ChatEventEnvelope) => void) => () => void
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
      probe: ProbeApi
      chat: ChatApi
    }
  }
}
