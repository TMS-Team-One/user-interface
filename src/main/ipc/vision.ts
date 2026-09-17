import { ipcMain } from 'electron'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { BoardPose, LocalisationResult, PrinterPosition, Project } from '../../shared/types'
import { requireProject, saveProjectPose } from '../db/projects.repository'
import { probeProcess } from '../services/probe-process'
import { agreedLocalisation } from '../vision/consensus'

// The last localisation of each project, for the sync that follows it.
const lastLocalisation = new Map<number, LocalisationResult>()

// cad_features.load finds drill files by their M48 header and the top solder
// mask by a .gts name, so the mask is written under a fixed name. Every frame is
// localised on its own; the pose most frames agree on is the answer.
async function locateBoard(
  project: Project,
  frames: ArrayBuffer[],
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
    const located: { result: LocalisationResult; annotatedPath: string }[] = []
    for (const [index, frame] of frames.entries()) {
      const image = join(dir, `frame-${index}.jpg`)
      await writeFile(image, Buffer.from(frame))
      const annotatedPath = join(dir, `frame-${index}_located.jpg`)
      const result = await probeProcess.request<LocalisationResult>('locate_board', {
        image,
        cad_dir: cadDir,
        outline: outline.length > 0 ? outline : null,
        annotated: annotatedPath
      })
      located.push({ result, annotatedPath })
    }
    const chosen = agreedLocalisation(located.map((entry) => entry.result))
    const annotated = await readFile(located[chosen.index].annotatedPath)
    return { result: chosen.result, annotated: toArrayBuffer(annotated) }
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
    async (_event, projectId: number, frames: ArrayBuffer[], outline: [number, number][]) => {
      if (frames.length === 0) throw new Error('No camera frame')
      const located = await locateBoard(requireProject(projectId), frames, outline)
      if (located.result.fit?.pass) lastLocalisation.set(projectId, located.result)
      return located
    }
  )

  ipcMain.handle(
    'vision:lastLocalisation',
    (_event, projectId: number) => lastLocalisation.get(projectId) ?? null
  )

  ipcMain.handle('vision:printerPosition', (): Promise<PrinterPosition> =>
    probeProcess.request<PrinterPosition>('position')
  )

  // The probe stands on the given localised feature; the printer position there
  // pins the board's origin down. See src/main/vision/sync.py.
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
      const pose = await probeProcess.request<BoardPose>('sync_pose', request)
      saveProjectPose(projectId, pose)
      return pose
    }
  )
}
