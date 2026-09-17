import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { BoardPose, LocalisationResult, PrinterPosition, Project } from '../../shared/types'
import { requireProject, saveProjectPose } from '../db/projects.repository'
import { runBackend } from '../backend'

// The last localisation of each project, for the sync that follows it.
const lastLocalisation = new Map<number, LocalisationResult>()

// cad_features.load in the backend finds drill files by their M48 header and the
// top solder mask by a .gts name, so the mask is written under a fixed name.
async function locateBoard(
  project: Project,
  frame: ArrayBuffer,
  outline: [number, number][]
): Promise<{ result: LocalisationResult; annotated: ArrayBuffer }> {
  const dir = await mkdtemp(join(tmpdir(), 'probepilot-locate-'))
  try {
    const cadDir = join(dir, 'cad')
    await mkdir(cadDir)
    for (const file of project.files) {
      if (file.kind === 'drill') await writeFile(join(cadDir, file.fileName), file.content)
      if (file.layerType === 'soldermask' && file.layerSide === 'top') {
        await writeFile(join(cadDir, 'top-solder-mask.gts'), file.content)
      }
    }
    const image = join(dir, 'frame.jpg')
    await writeFile(image, Buffer.from(frame))
    const args = ['scripts.locate_pcb', image, '--cad', cadDir]
    if (outline.length > 0) {
      await writeFile(join(dir, 'outline.json'), JSON.stringify(outline))
      args.push('--outline', join(dir, 'outline.json'))
    }
    const { code, stderr } = await runBackend(args)
    const resultPath = join(dir, 'frame_located.json')
    if (!existsSync(resultPath)) {
      throw new Error(stderr.trim() || `locate_pcb exited with code ${code}`)
    }
    const result = JSON.parse(await readFile(resultPath, 'utf8')) as LocalisationResult
    const annotated = await readFile(join(dir, 'frame_located.jpg'))
    return { result, annotated: toArrayBuffer(annotated) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
}

export function registerVisionIpc(): void {
  ipcMain.handle(
    'vision:locateBoard',
    async (_event, projectId: number, frame: ArrayBuffer, outline: [number, number][]) => {
      const located = await locateBoard(requireProject(projectId), frame, outline)
      if (located.result.fit?.pass) lastLocalisation.set(projectId, located.result)
      return located
    }
  )

  ipcMain.handle(
    'vision:lastLocalisation',
    (_event, projectId: number) => lastLocalisation.get(projectId) ?? null
  )

  ipcMain.handle('vision:printerPosition', async (): Promise<PrinterPosition> => {
    const { code, stdout, stderr } = await runBackend(['scripts.printer_position'])
    if (code !== 0) throw new Error(stderr.trim() || 'printer position could not be read')
    return JSON.parse(stdout) as PrinterPosition
  })

  // The probe stands on the given localised feature; the printer position there
  // pins the board's origin down. See backend/src/vision/sync.py.
  ipcMain.handle(
    'vision:syncPose',
    async (
      _event,
      projectId: number,
      featureId: number,
      printer: PrinterPosition
    ): Promise<BoardPose> => {
      const located = lastLocalisation.get(projectId)
      if (!located?.fit?.pass)
        throw new Error('Locate the board first; the last localisation did not pass')
      const feature = located.features.find((candidate) => candidate.id === featureId)
      if (!feature) throw new Error(`Feature ${featureId} is not in the localisation`)
      const request = {
        located,
        pad_board_xy: feature.board_xy,
        printer_xyz: [printer.x, printer.y, printer.z]
      }
      const { code, stdout, stderr } = await runBackend(
        ['scripts.sync_pose'],
        JSON.stringify(request)
      )
      if (code !== 0) throw new Error(stderr.trim() || 'sync failed')
      const pose = JSON.parse(stdout) as BoardPose
      saveProjectPose(projectId, pose)
      return pose
    }
  )
}
