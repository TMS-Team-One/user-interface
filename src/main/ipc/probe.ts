import { ipcMain } from 'electron'
import type { ProbeConnectionStatus } from '../../shared/types'
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
}
