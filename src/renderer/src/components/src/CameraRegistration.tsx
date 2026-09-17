import type { CameraRegistration, LocalisationResult, PrinterPose, SheetView } from '@shared/types'
import { boardToPrinter } from '@shared/board-pose'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/errors'
import { JogControls } from './JogControls'

// The bed moves this far down between the calibration pictures, this many times.
const CALIBRATION_STEP_MM = 15
const CALIBRATION_STEPS = 3
// How long the stream takes to show the bed at its new height.
const SETTLE_MS = 1500
// The hover over the board stays this far above its estimated or measured surface.
const HOVER_ABOVE_BOARD_MM = 10

function centroid(points: [number, number][]): [number, number] {
  const sum = points.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}

const formatXyz = ([x, y, z]: [number, number, number]): string =>
  `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Measures the camera against the bed sheet from pictures at several bed
 * heights, shows the sheet's targets on the video, and takes the board's
 * contact height with the tip on the board. The touches on the targets are
 * made from the manual control dialog in the sidebar.
 */
export function CameraRegistrationPanel({
  projectId,
  located,
  outline,
  registration,
  busy,
  captureFrame,
  onRegistration,
  onSheetView,
  onPose
}: {
  projectId: number
  located: LocalisationResult | null
  outline: [number, number][]
  registration: CameraRegistration
  busy: boolean
  captureFrame: () => Promise<ArrayBuffer>
  onRegistration: (registration: CameraRegistration) => void
  onSheetView: (view: SheetView) => void
  onPose: (pose: PrinterPose) => void
}): React.JSX.Element {
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pose = located?.fit?.pass ? located.pose_on_printer : undefined
  const disabled = busy || working

  const run = async (what: string, action: () => Promise<string>): Promise<void> => {
    setWorking(true)
    setMessage(`${what}...`)
    try {
      setMessage(await action())
    } catch (error) {
      setMessage(describeError(error))
    } finally {
      setWorking(false)
    }
  }

  const calibrate = (): Promise<void> =>
    run('Calibrating the camera', async () => {
      const start = await window.api.vision.printerPosition()
      const frames: ArrayBuffer[] = []
      const heights: number[] = []
      let moved = false
      try {
        for (let step = 0; step <= CALIBRATION_STEPS; step++) {
          let at = start
          if (step > 0) {
            moved = true
            at = await window.api.probe.move({
              x: start.x,
              y: start.y,
              z: start.z + step * CALIBRATION_STEP_MM
            })
          }
          setMessage(`Picture ${step + 1} of ${CALIBRATION_STEPS + 1} at Z ${at.z.toFixed(1)}...`)
          await wait(SETTLE_MS)
          frames.push(await captureFrame())
          heights.push(at.z)
        }
      } finally {
        if (moved) await window.api.probe.move({ x: start.x, y: start.y, z: start.z })
      }
      const registered = await window.api.vision.calibrateCamera(frames, heights)
      onRegistration(registered)
      const camera = registered.camera!
      return (
        `Camera calibrated: focal length ${camera.focal_px.toFixed(0)} px, lens fit ` +
        `${camera.rms_px.toFixed(2)} px, bed steps reproduced within ${camera.step_residual_mm.toFixed(2)} mm`
      )
    })

  const findTargets = (): Promise<void> =>
    run('Looking for the sheet', async () => {
      const view = await window.api.vision.detectSheet(await captureFrame())
      onSheetView(view)
      const seen = Object.keys(view.targets).sort().join(', ')
      const camera =
        view.distance_mm !== null && view.rms_px !== null
          ? `; camera ${view.distance_mm.toFixed(0)} mm from the sheet, fit ${view.rms_px.toFixed(2)} px`
          : ''
      return `${view.corners} sheet corners seen, targets ${seen || 'none'}${camera}`
    })

  const hover = (): Promise<void> =>
    run('Hovering over the board', async () => {
      if (!pose || !registration.sheet) throw new Error('Locate the board first')
      const middle =
        outline.length > 0 ? centroid(outline) : centroid(located!.features.map((f) => f.board_xy))
      const [x, y] = boardToPrinter(pose, middle)
      const z = registration.sheet.z_sheet + pose.board_height_mm + HOVER_ABOVE_BOARD_MM
      const position = await window.api.probe.move({ x, y, z })
      return (
        `Probe above the board at ${formatXyz([position.x, position.y, position.z])}; jog Z down ` +
        'until the tip touches the board, then capture the contact'
      )
    })

  const captureContact = (): Promise<void> =>
    run('Reading the contact height', async () => {
      const { z } = await window.api.vision.printerPosition()
      const saved = await window.api.vision.boardPose(projectId, z)
      onPose(saved)
      return (
        `Board pose saved: contact at Z ${z.toFixed(2)} mm, ${saved.board_height_mm.toFixed(1)} mm above ` +
        `the sheet, origin (${saved.x.toFixed(2)}, ${saved.y.toFixed(2)}) mm, ${saved.rotation_deg.toFixed(2)}°` +
        (saved.warnings.length > 0 ? ` (${saved.warnings.join('; ')})` : '')
      )
    })

  const camera = registration.camera
  const sheet = registration.sheet
  return (
    <div className="flex min-h-0 shrink flex-col gap-2 overflow-y-auto rounded-md border p-3 text-sm">
      <p className="text-muted-foreground">
        Sheet taped on the glass with its bar at the back, printer connected and homed, head parked
        out of the camera&apos;s view, bed at its usual picture height.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 font-medium">Camera</span>
        <Button size="sm" variant="outline" disabled={disabled} onClick={calibrate}>
          Calibrate camera
        </Button>
        <span className="text-muted-foreground">
          {camera
            ? `Calibrated ${camera.calibrated_at}: focal length ${camera.focal_px.toFixed(0)} px, ` +
              `lens fit ${camera.rms_px.toFixed(2)} px, bed steps within ${camera.step_residual_mm.toFixed(2)} mm`
            : `Not calibrated: moves the bed down ${CALIBRATION_STEPS} × ${CALIBRATION_STEP_MM} mm and back, a picture at each height`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 font-medium">Sheet</span>
        <Button size="sm" variant="outline" disabled={disabled} onClick={findTargets}>
          Find targets
        </Button>
        <span className="text-muted-foreground">
          {sheet
            ? `Registered ${sheet.registered_at}: ${sheet.touches.length} touches, residual ` +
              `${sheet.residual_mm.toFixed(2)} mm, printout at ${(sheet.scale * 100).toFixed(1)} %, ` +
              `paper at Z ${sheet.z_sheet.toFixed(2)} mm`
            : 'Not registered: take the positions of three target corners in the manual controls of the sidebar'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 font-medium">Board</span>
        <Button size="sm" variant="outline" disabled={disabled || !pose || !sheet} onClick={hover}>
          Hover over the board
        </Button>
        <Button size="sm" disabled={disabled || !pose || !sheet} onClick={captureContact}>
          Capture contact
        </Button>
        <span className="text-muted-foreground">
          {pose
            ? `Board ${pose.board_height_mm.toFixed(1)} mm above the sheet ` +
              `(${pose.height_estimated ? 'estimated from its size' : 'measured'})` +
              (pose.z_contact !== null ? `, contact at Z ${pose.z_contact.toFixed(2)} mm` : '')
            : 'Locate the board with the camera calibrated and the sheet registered'}
        </span>
      </div>
      <div className="pl-18">
        <JogControls disabled={disabled} />
      </div>
      {message && <p>{message}</p>}
    </div>
  )
}
