import { ipcMain } from 'electron'
import type {
  ManualProbeCoordinates,
  ManualProbeResult,
  ProbeConnectionStatus
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
    'probe:runManualTest',
    (_event, coordinates: ManualProbeCoordinates): Promise<ManualProbeResult> =>
      probeProcess.request<ManualProbeResult>(
        'run_manual_test',
        { ...coordinates },
        { timeoutMs: 120_000 }
      )
  )
}
