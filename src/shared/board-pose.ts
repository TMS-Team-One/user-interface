import type { BoardPose, ParsedPad } from './types'

const MM_PER_INCH = 25.4

/** A pad's centre in board millimetres; the pad parser reports inches. */
export function padMm(pad: ParsedPad): [number, number] {
  return [pad.x * MM_PER_INCH, pad.y * MM_PER_INCH]
}

/** A board point through the pose the runner uses: where the probe finds it on the printer. */
export function boardToPrinter(
  pose: Pick<BoardPose, 'x' | 'y' | 'rotation_deg'>,
  [x, y]: [number, number]
): [number, number] {
  const angle = (pose.rotation_deg * Math.PI) / 180
  return [
    pose.x + x * Math.cos(angle) - y * Math.sin(angle),
    pose.y + x * Math.sin(angle) + y * Math.cos(angle)
  ]
}
