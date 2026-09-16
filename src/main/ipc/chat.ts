import { ipcMain } from 'electron'
import type { ChatEvent, ChatResult, ChatSendRequest, Test } from '../../shared/types'
import { getTestById } from '../db/tests.repository'
import { probeProcess } from '../services/probe-process'

const CHAT_EVENT_CHANNEL = 'chat:event'

export function registerChatIpc(): void {
  ipcMain.handle('chat:history', async (_event, testId: number): Promise<ChatResult> => {
    requireTest(testId)
    return probeProcess.request<ChatResult>('chat_history', { test_id: testId })
  })

  ipcMain.handle('chat:send', async (event, request: ChatSendRequest): Promise<ChatResult> => {
    const test = requireTest(request.testId)
    const message = request.message.trim()
    if (!message) throw new Error('Chat message must not be empty')

    return probeProcess.request<ChatResult>(
      'chat',
      {
        test_id: test.id,
        test_name: test.testName,
        file_name: test.fileName,
        message
      },
      {
        timeoutMs: 10 * 60_000,
        onEvent: (chatEvent) => {
          if (event.sender.isDestroyed()) return
          event.sender.send(CHAT_EVENT_CHANNEL, {
            runId: request.runId,
            testId: request.testId,
            event: chatEvent as ChatEvent
          })
        }
      }
    )
  })
}

function requireTest(testId: number): Test {
  if (!Number.isInteger(testId)) throw new Error('Invalid test case ID')
  const test = getTestById(testId)
  if (!test) throw new Error(`No test found with id ${testId}`)
  return test
}
