import { ipcMain } from 'electron'
import type { LiveEvent, RunTarget } from '../../shared/types'
import { getProjectPose, requireProject } from '../db/projects.repository'
import { collectPads } from '../parsing/pads'
import { probeProcess } from '../services/probe-process'

// Where the board lies on the bed until the camera sync supplies its pose.
const DEFAULT_POSE = { x: 60, y: 60, z_contact: 12, rotation_deg: 0 }
const SAFE_HEIGHT_MM = 8
// A simulated head runs this much faster than the real one would.
const SIMULATION_TIME_SCALE = 0.1
const MM_PER_INCH = 25.4
// The bridge answers when the run is over; a real head needs seconds per pad.
const RUN_TIMEOUT_MS = 60 * 60_000

export interface RunRecord {
  backend: string
  instrument: string
  contacts: { label: string; voltage: number }[]
}

/** The last test run of each project, for the chat agent. */
export const lastRuns = new Map<number, RunRecord>()

export function registerLiveIpc(): void {
  // Sends the project's testable pads to the hardware bridge as one probing job
  // and streams the runner's events back to the window that asked. Returns the
  // number of pads it visits.
  ipcMain.handle('live:start', async (event, projectId: number): Promise<number> => {
    const pads = await collectPads(requireProject(projectId))
    const targets: RunTarget[] = pads
      .filter((pad) => pad.testable)
      .map((pad, index) => ({
        index,
        x: pad.x * MM_PER_INCH,
        y: pad.y * MM_PER_INCH,
        label: pad.net_name ?? `pad ${index + 1}`
      }))
    const send = (liveEvent: LiveEvent): void => {
      if (liveEvent.type === 'started') {
        lastRuns.set(projectId, {
          backend: liveEvent.backend,
          instrument: liveEvent.instrument,
          contacts: []
        })
      }
      if (liveEvent.type === 'contact') {
        lastRuns
          .get(projectId)
          ?.contacts.push({ label: liveEvent.target.label, voltage: liveEvent.voltage })
      }
      if (!event.sender.isDestroyed()) event.sender.send('live:event', liveEvent)
    }

    const job = {
      targets,
      pose: getProjectPose(projectId) ?? DEFAULT_POSE,
      safe_height: SAFE_HEIGHT_MM,
      time_scale: SIMULATION_TIME_SCALE
    }
    probeProcess
      .request('run_test', job, {
        timeoutMs: RUN_TIMEOUT_MS,
        onEvent: (liveEvent) => send(liveEvent as LiveEvent)
      })
      .catch((error: Error) => {
        send({ type: 'error', message: error.message })
        send({ type: 'finished' })
      })
    return targets.length
  })

  ipcMain.handle('live:stop', async () => {
    await probeProcess.request('stop_run')
  })

  // WHEP signalling for the camera stream: the offer goes to <stream url>/whep,
  // the answer comes back for the renderer's peer connection.
  ipcMain.handle('camera:whep', async (_event, url: string, offerSdp: string): Promise<string> => {
    const response = await fetch(`${url.replace(/\/+$/, '')}/whep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: offerSdp
    })
    if (!response.ok) throw new Error(`camera stream answered ${response.status}`)
    return response.text()
  })
}
