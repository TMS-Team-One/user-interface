import { app, ipcMain } from 'electron'
import { join } from 'path'
import type { ChatEvent, ChatResult, ChatSendRequest } from '../../shared/types'
import { getProjectPose, requireProject } from '../db/projects.repository'
import { isProtelNetlist, parseProtel } from '../netlist/protel'
import { collectPads } from '../parsing/pads'
import { probeProcess } from '../services/probe-process'
import { writeCadFiles } from '../vision/cad-dir'
import { lastRuns } from './live'

const CHAT_EVENT_CHANNEL = 'chat:event'
const MM_PER_INCH = 25.4
// One agent turn may home the printer and move it several times.
const CHAT_TIMEOUT_MS = 10 * 60_000

// Everything the app knows about the project, handed to the bridge with each
// message; the agent gets it as tools next to the printer's tools. A Protel
// netlist contributes the components and which pins share a net; an IPC-D-356
// one has already named the pads. The camera tool gets the stream address,
// a folder for its pictures and the CAD files for finding the board.
async function projectContext(request: ChatSendRequest): Promise<Record<string, unknown>> {
  const { projectId } = request
  const project = requireProject(projectId)
  const pads = await collectPads(project)
  const protel = project.files.find(
    (file) => file.kind === 'netlist' && isProtelNetlist(file.content)
  )
  const cadDir = join(app.getPath('userData'), 'cad', String(projectId))
  const hasDrills = project.files.some((file) => file.kind === 'drill')
  if (hasDrills) await writeCadFiles(project, cadDir)
  return {
    name: project.name,
    files: project.files.map((file) => `${file.fileName} (${file.kind})`),
    netlist: protel ? parseProtel(protel.content) : null,
    camera_url: request.cameraUrl || null,
    pictures_dir: join(app.getPath('userData'), 'pictures', String(projectId)),
    cad_dir: hasDrills ? cadDir : null,
    outline: request.outline.length > 0 ? request.outline : null,
    pads: pads.map((pad, index) => ({
      label: pad.net_name ?? `pad ${index + 1}`,
      net: pad.net_name,
      side: pad.side,
      x: Number((pad.x * MM_PER_INCH).toFixed(3)),
      y: Number((pad.y * MM_PER_INCH).toFixed(3)),
      testable: pad.testable,
      reason: pad.untestableReason
    })),
    last_run: lastRuns.get(projectId) ?? null,
    pose: getProjectPose(projectId)
  }
}

export function registerChatIpc(): void {
  ipcMain.handle('chat:history', (_event, projectId: number): Promise<ChatResult> => {
    requireProject(projectId)
    return probeProcess.request<ChatResult>('chat_history', { project_id: projectId })
  })

  ipcMain.handle('chat:send', async (event, request: ChatSendRequest): Promise<ChatResult> => {
    const message = request.message.trim()
    if (!message) throw new Error('Chat message must not be empty')
    const context = await projectContext(request)

    return probeProcess.request<ChatResult>(
      'chat',
      { project_id: request.projectId, message, context },
      {
        timeoutMs: CHAT_TIMEOUT_MS,
        onEvent: (chatEvent) => {
          if (event.sender.isDestroyed()) return
          event.sender.send(CHAT_EVENT_CHANNEL, {
            runId: request.runId,
            projectId: request.projectId,
            event: chatEvent as ChatEvent
          })
        }
      }
    )
  })
}
