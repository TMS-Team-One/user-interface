import { ipcMain } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import type { LiveEvent, RunTarget } from '../../shared/types'
import { getProjectPose, requireProject } from '../db/projects.repository'
import { collectPads } from '../parsing/pads'
import { PROBE_PILOT_DIR, PYTHON_EXECUTABLE } from '../probe-pilot'

// Where the board lies on the bed until the camera sync supplies its pose.
const DEFAULT_POSE = { x: 60, y: 60, z_contact: 12, rotation_deg: 0 }
const SAFE_HEIGHT_MM = 8
// A simulated head runs this much faster than the real one would.
const SIMULATION_TIME_SCALE = '0.1'
const MM_PER_INCH = 25.4

export interface RunRecord {
  backend: string
  instrument: string
  contacts: { label: string; voltage: number }[]
}

/** The last test run of each project, for the chat agent. */
export const lastRuns = new Map<number, RunRecord>()

let runner: ChildProcess | null = null

export function registerLiveIpc(): void {
  // Sends the project's testable pads to the probe-pilot runner and streams its
  // events back to the window that asked. Returns the number of pads it visits.
  ipcMain.handle('live:start', async (event, projectId: number): Promise<number> => {
    // A superseded runner is killed quietly; only the current one reports its end.
    runner?.kill()
    runner = null
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

    const child = spawn(
      PYTHON_EXECUTABLE,
      ['-m', 'scripts.run_test', '--time-scale', SIMULATION_TIME_SCALE],
      { cwd: PROBE_PILOT_DIR }
    )
    runner = child
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        send(JSON.parse(line))
      } catch {
        console.error('probe-pilot runner said:', line)
      }
    })
    child.stderr.on('data', (chunk) => console.error('probe-pilot runner:', String(chunk)))
    child.on('error', (error) => send({ type: 'error', message: String(error) }))
    child.on('close', (code) => {
      if (runner !== child) return
      runner = null
      if (code) send({ type: 'error', message: `probe-pilot runner exited with code ${code}` })
      send({ type: 'finished' })
    })
    const pose = getProjectPose(projectId) ?? DEFAULT_POSE
    child.stdin.end(JSON.stringify({ targets, pose, safe_height: SAFE_HEIGHT_MM }))
    return targets.length
  })

  ipcMain.handle('live:stop', () => {
    runner?.kill()
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
