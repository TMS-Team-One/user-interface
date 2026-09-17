import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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
  Project,
  ProjectFile,
  PrinterPose,
  ProjectSummary,
  SheetTouch,
  SheetView,
  VoltageReading
} from '../shared/types'

// Custom APIs for renderer
const api = {
  projects: {
    create: (name: string, files: ProjectFile[]): Promise<ProjectSummary> =>
      ipcRenderer.invoke('projects:create', name, files),
    delete: (id: number): Promise<boolean> => ipcRenderer.invoke('projects:delete', id),
    deleteMany: (ids: number[]): Promise<number> => ipcRenderer.invoke('projects:deleteMany', ids),
    getById: (id: number): Promise<Project | undefined> =>
      ipcRenderer.invoke('projects:getById', id),
    list: (): Promise<ProjectSummary[]> => ipcRenderer.invoke('projects:list'),
    getModel: (id: number): Promise<ArrayBuffer | null> =>
      ipcRenderer.invoke('projects:getModel', id),
    getPose: (id: number): Promise<BoardPose | null> => ipcRenderer.invoke('projects:getPose', id)
  },
  vision: {
    locateBoard: (
      projectId: number,
      frames: ArrayBuffer[],
      outline: [number, number][]
    ): Promise<{ result: LocalisationResult; annotated: ArrayBuffer }> =>
      ipcRenderer.invoke('vision:locateBoard', projectId, frames, outline),
    lastLocalisation: (projectId: number): Promise<LocalisationResult | null> =>
      ipcRenderer.invoke('vision:lastLocalisation', projectId),
    printerPosition: (): Promise<PrinterPosition> => ipcRenderer.invoke('vision:printerPosition'),
    registration: (): Promise<CameraRegistration> => ipcRenderer.invoke('vision:registration'),
    calibrateCamera: (frames: ArrayBuffer[], bedZs: number[]): Promise<CameraRegistration> =>
      ipcRenderer.invoke('vision:calibrateCamera', frames, bedZs),
    registerSheet: (touches: SheetTouch[]): Promise<CameraRegistration> =>
      ipcRenderer.invoke('vision:registerSheet', touches),
    detectSheet: (frame: ArrayBuffer): Promise<SheetView> =>
      ipcRenderer.invoke('vision:detectSheet', frame),
    boardPose: (projectId: number, zContact: number): Promise<PrinterPose> =>
      ipcRenderer.invoke('vision:boardPose', projectId, zContact),
    syncPose: (
      projectId: number,
      featureId: number,
      printer: PrinterPosition
    ): Promise<BoardPose> => ipcRenderer.invoke('vision:syncPose', projectId, featureId, printer)
  },
  probe: {
    connect: (): Promise<ProbeConnectionStatus> => ipcRenderer.invoke('probe:connect'),
    status: (): Promise<ProbeConnectionStatus> => ipcRenderer.invoke('probe:status'),
    disconnect: (): Promise<ProbeConnectionStatus> => ipcRenderer.invoke('probe:disconnect'),
    home: (): Promise<ProbeConnectionStatus> => ipcRenderer.invoke('probe:home'),
    measure: (): Promise<VoltageReading> => ipcRenderer.invoke('probe:measure'),
    probeAt: (coordinates: ManualProbeCoordinates): Promise<ProbeResult> =>
      ipcRenderer.invoke('probe:probeAt', coordinates),
    move: (coordinates: ManualProbeCoordinates): Promise<PrinterPosition> =>
      ipcRenderer.invoke('probe:move', coordinates),
    jog: (step: JogStep): Promise<PrinterPosition> => ipcRenderer.invoke('probe:jog', step)
  },
  chat: {
    history: (projectId: number): Promise<ChatResult> =>
      ipcRenderer.invoke('chat:history', projectId),
    send: (request: ChatSendRequest): Promise<ChatResult> =>
      ipcRenderer.invoke('chat:send', request),
    onEvent: (listener: (envelope: ChatEventEnvelope) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, envelope: ChatEventEnvelope): void =>
        listener(envelope)
      ipcRenderer.on('chat:event', handler)
      return () => {
        ipcRenderer.removeListener('chat:event', handler)
      }
    }
  },
  parsing: {
    parsePads: (projectId: number): Promise<GerberParseResult> =>
      ipcRenderer.invoke('parsing:parsePads', projectId),
    renderBoard: (projectId: number): Promise<BoardRender> =>
      ipcRenderer.invoke('parsing:renderBoard', projectId),
    classifyFile: (fileName: string, head: string): Promise<FileClassification | null> =>
      ipcRenderer.invoke('parsing:classifyFile', fileName, head)
  },
  live: {
    start: (projectId: number): Promise<number> => ipcRenderer.invoke('live:start', projectId),
    stop: (): Promise<void> => ipcRenderer.invoke('live:stop'),
    whep: (url: string, offerSdp: string): Promise<string> =>
      ipcRenderer.invoke('camera:whep', url, offerSdp),
    onEvent: (listener: (event: LiveEvent) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, liveEvent: LiveEvent): void => listener(liveEvent)
      ipcRenderer.on('live:event', handler)
      return () => {
        ipcRenderer.removeListener('live:event', handler)
      }
    }
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
