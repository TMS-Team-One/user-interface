import { ipcMain } from 'electron'
import type { GerberParseResult } from '../../shared/types'
import { classifyFileWithAi } from '../ai/classify-file'
import { requireProject } from '../db/projects.repository'
import { collectPads } from '../parsing/pads'
import { renderBoard } from '../parsing/render-board'

export function registerParsingIpc(): void {
  ipcMain.handle(
    'parsing:parsePads',
    async (_event, projectId: number): Promise<GerberParseResult> => ({
      pads: await collectPads(requireProject(projectId))
    })
  )

  ipcMain.handle('parsing:renderBoard', (_event, projectId: number) =>
    renderBoard(requireProject(projectId).files, `board-${projectId}`)
  )

  ipcMain.handle('parsing:classifyFile', (_event, fileName: string, head: string) =>
    classifyFileWithAi(fileName, head)
  )
}
