import { ipcMain } from 'electron'
import type {
  JogStep,
  ManualProbeCoordinates,
  PrinterPosition,
  ProbeConnectionStatus,
  ProbeResult,
  VoltageReading
} from '../../shared/types'
import { probeProcess } from '../services/probe-process'

export function registerProbeIpc(): void {
  ipcMain.handle('probe:connect', (): Promise<ProbeConnectionStatus> =>
    probeProcess.request<ProbeConnectionStatus>('connect')
  )
  ipcMain.handle('probe:status', (): Promise<ProbeConnectionStatus> =>
    probeProcess.request<ProbeConnectionStatus>('status')
  )
  ipcMain.handle('probe:disconnect', (): Promise<ProbeConnectionStatus> =>
    probeProcess.request<ProbeConnectionStatus>('disconnect')
  )
  ipcMain.handle('probe:home', (): Promise<ProbeConnectionStatus> =>
    probeProcess.request<ProbeConnectionStatus>('home', undefined, { timeoutMs: 120_000 })
  )
  ipcMain.handle(
    'probe:move',
    (_event, coordinates: ManualProbeCoordinates): Promise<PrinterPosition> =>
      probeProcess.request<PrinterPosition>('move', { ...coordinates }, { timeoutMs: 120_000 })
  )
  ipcMain.handle('probe:jog', (_event, step: JogStep): Promise<PrinterPosition> =>
    probeProcess.request<PrinterPosition>('jog', { ...step }, { timeoutMs: 120_000 })
  )
  // Move to a position, measure there and retract: one pad probed by hand.
  ipcMain.handle(
    'probe:probeAt',
    (_event, coordinates: ManualProbeCoordinates): Promise<ProbeResult> =>
      probeProcess.request<ProbeResult>(
        'run_manual_test',
        { ...coordinates },
        { timeoutMs: 120_000 }
      )
  )
  ipcMain.handle('probe:measure', (): Promise<VoltageReading> =>
    probeProcess.request<VoltageReading>('measure', undefined, { timeoutMs: 60_000 })
  )
}
