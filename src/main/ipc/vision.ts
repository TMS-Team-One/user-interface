import { ipcMain } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  BoardPose,
  CameraModel,
  CameraRegistration,
  LocalisationResult,
  PrinterPose,
  PrinterPosition,
  Project,
  SheetRegistration,
  SheetTouch,
  SheetView
} from '../../shared/types'
import { getRegistration, saveRegistration } from '../camera/registration-store'
import { getProjectPose, requireProject, saveProjectPose } from '../db/projects.repository'
import { probeProcess } from '../services/probe-process'
import { writeCadFiles } from '../vision/cad-dir'
import { agreedLocalisation } from '../vision/consensus'

// The last localisation of each project, for the sync and the contact height that follow it.
const lastLocalisation = new Map<number, LocalisationResult>()

// Frames written to a temporary folder for the bridge, removed afterwards.
async function withFrames<T>(
  prefix: string,
  frames: ArrayBuffer[],
  consume: (dir: string, paths: string[]) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  try {
    const paths: string[] = []
    for (const [index, frame] of frames.entries()) {
      const path = join(dir, `frame-${index}.jpg`)
      await writeFile(path, Buffer.from(frame))
      paths.push(path)
    }
    return await consume(dir, paths)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// Every frame is localised on its own; the pose most frames agree on is the answer.
function locateBoard(
  project: Project,
  frames: ArrayBuffer[],
  outline: [number, number][]
): Promise<{ result: LocalisationResult; annotated: ArrayBuffer }> {
  return withFrames('probepilot-locate-', frames, async (dir, paths) => {
    const cadDir = join(dir, 'cad')
    await writeCadFiles(project, cadDir)
    const registration = getRegistration()
    const z_contact = getProjectPose(project.id)?.z_contact ?? null
    const located: { result: LocalisationResult; annotatedPath: string }[] = []
    for (const [index, image] of paths.entries()) {
      const annotatedPath = join(dir, `frame-${index}_located.jpg`)
      const result = await probeProcess.request<LocalisationResult>('locate_board', {
        image,
        cad_dir: cadDir,
        outline: outline.length > 0 ? outline : null,
        annotated: annotatedPath,
        registration,
        z_contact
      })
      located.push({ result, annotatedPath })
    }
    const chosen = agreedLocalisation(located.map((entry) => entry.result))
    const annotated = await readFile(located[chosen.index].annotatedPath)
    return { result: chosen.result, annotated: toArrayBuffer(annotated) }
  })
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
}

// The pose every run uses, once the board's contact height is known.
function keepPose(projectId: number, pose: PrinterPose): void {
  if (pose.z_contact === null) return
  saveProjectPose(projectId, {
    x: pose.x,
    y: pose.y,
    z_contact: pose.z_contact,
    rotation_deg: pose.rotation_deg
  })
}

export function registerVisionIpc(): void {
  ipcMain.handle(
    'vision:locateBoard',
    async (_event, projectId: number, frames: ArrayBuffer[], outline: [number, number][]) => {
      if (frames.length === 0) throw new Error('No camera frame')
      const located = await locateBoard(requireProject(projectId), frames, outline)
      if (located.result.fit?.pass) {
        lastLocalisation.set(projectId, located.result)
        if (located.result.pose_on_printer) keepPose(projectId, located.result.pose_on_printer)
      }
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

  ipcMain.handle('vision:registration', (): CameraRegistration => getRegistration())

  // Pictures of the sheet with the bed at the given heights give the camera model.
  ipcMain.handle(
    'vision:calibrateCamera',
    (_event, frames: ArrayBuffer[], bedZs: number[]): Promise<CameraRegistration> =>
      withFrames('probepilot-calibrate-', frames, async (_dir, paths) => {
        const camera = await probeProcess.request<CameraModel>('calibrate_camera', {
          pictures: paths.map((image, index) => ({ image, bed_z: bedZs[index] }))
        })
        return saveRegistration({ camera })
      })
  )

  ipcMain.handle(
    'vision:registerSheet',
    async (_event, touches: SheetTouch[]): Promise<CameraRegistration> => {
      const sheet = await probeProcess.request<SheetRegistration>('register_sheet', { touches })
      return saveRegistration({ sheet })
    }
  )

  ipcMain.handle('vision:detectSheet', (_event, frame: ArrayBuffer): Promise<SheetView> =>
    withFrames('probepilot-sheet-', [frame], (_dir, [image]) =>
      probeProcess.request<SheetView>('detect_sheet', {
        image,
        registration: getRegistration()
      })
    )
  )

  // The probe touched the board's top at this bed height: the last localisation's
  // pose again with the board's real height, kept for the runs.
  ipcMain.handle(
    'vision:boardPose',
    async (_event, projectId: number, zContact: number): Promise<PrinterPose> => {
      const located = lastLocalisation.get(projectId)
      if (!located?.fit?.pass)
        throw new Error('Locate the board first; the last localisation did not pass')
      const pose = await probeProcess.request<PrinterPose>('board_pose', {
        localisation: located,
        registration: getRegistration(),
        z_contact: zContact
      })
      located.pose_on_printer = pose
      keepPose(projectId, pose)
      return pose
    }
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
