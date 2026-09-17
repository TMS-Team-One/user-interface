import { ipcMain } from 'electron'
import type { ChatReply, ChatTurn } from '../../shared/types'
import { getProjectPose, requireProject } from '../db/projects.repository'
import { lastRuns } from './live'
import { collectPads } from '../parsing/pads'
import { runProbePilot } from '../probe-pilot'

const MM_PER_INCH = 25.4

// One chat turn through probe-pilot's LangGraph agent (scripts/chat.py), with
// everything the app knows about the project handed over as the agent's tools.
export function registerChatIpc(): void {
  ipcMain.handle(
    'chat:send',
    async (_event, projectId: number, messages: ChatTurn[]): Promise<ChatReply> => {
      const project = requireProject(projectId)
      const pads = await collectPads(project)
      const context = {
        name: project.name,
        files: project.files.map((file) => `${file.fileName} (${file.kind})`),
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
      const { stdout, stderr } = await runProbePilot(
        ['scripts.chat'],
        JSON.stringify({ messages, context })
      )

      const reply: ChatReply = { text: '', tools: [], error: null }
      for (const line of stdout.split('\n').filter(Boolean)) {
        const event = JSON.parse(line)
        if (event.type === 'tool') reply.tools.push(event.name)
        if (event.type === 'reply') reply.text = event.text
        if (event.type === 'error') reply.error = event.message
      }
      if (!reply.text && !reply.error) reply.error = stderr.trim() || 'the agent gave no answer'
      return reply
    }
  )
}
