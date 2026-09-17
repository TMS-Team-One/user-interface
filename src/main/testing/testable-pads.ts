import type { PackedMesh } from '../../shared/mesh-pack'
import type { ParsedPad } from '../../shared/types'
import type { DrillHole } from '../parsing/excellon'

// The probe tip is 0.5 mm; the pad must still be hit when the localisation is
// off by the placement tolerance in any direction.
const PROBE_TIP_DIAMETER_MM = 0.5
const PLACEMENT_TOLERANCE_MM = 0.05
const MIN_PAD_SIZE_MM = PROBE_TIP_DIAMETER_MM + 2 * PLACEMENT_TOLERANCE_MM
// No component body may come closer than this to the pad centre, so the probe
// barrel (1 mm) and holder clear it on the way down.
const PROBE_CLEARANCE_MM = 1.0
// A solder-mask opening this close to a pad's centre exposes the pad; tented
// vias have no opening and cannot be probed.
const MASK_OPENING_TOLERANCE_MM = 0.15
const MM_PER_INCH = 25.4

/** Centre of a solder-mask opening, in inches like the pads. */
export interface MaskOpening {
  x: number
  y: number
}

interface Footprint {
  name: string
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Bounding boxes of the components on the top side, in board millimetres. The
 * board body itself is the mesh with by far the largest footprint and is left
 * out; meshes entirely below the top face (pin tails) do not matter for probing.
 */
export function componentFootprints(meshes: PackedMesh[]): Footprint[] {
  const boxes = meshes.map((mesh) => {
    const box = {
      name: mesh.name || 'component',
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity
    }
    const p = mesh.positions
    for (let i = 0; i < p.length; i += 3) {
      box.minX = Math.min(box.minX, p[i])
      box.maxX = Math.max(box.maxX, p[i])
      box.minY = Math.min(box.minY, p[i + 1])
      box.maxY = Math.max(box.maxY, p[i + 1])
      box.minZ = Math.min(box.minZ, p[i + 2])
      box.maxZ = Math.max(box.maxZ, p[i + 2])
    }
    return box
  })
  const area = (box: (typeof boxes)[number]): number =>
    (box.maxX - box.minX) * (box.maxY - box.minY)
  const board = boxes.reduce(
    (largest, box) => (area(box) > area(largest) ? box : largest),
    boxes[0]
  )
  return boxes
    .filter((box) => box !== board && box.maxZ > 0)
    .map(({ name, minX, minY, maxX, maxY }) => ({ name, minX, minY, maxX, maxY }))
}

/**
 * Decides for every pad whether the probe can be put on it: top side only,
 * large enough for the tip, exposed by the solder mask, not under a component
 * and not within the probe's clearance of one. Without a mask file or a model
 * the rules that need them are skipped.
 */
export function markTestablePads(
  pads: ParsedPad[],
  footprints: Footprint[] | null,
  maskOpenings: MaskOpening[] | null,
  holes: DrillHole[]
): ParsedPad[] {
  return pads.map((pad) => {
    const reason = untestableReason(pad, footprints, maskOpenings, holes)
    return { ...pad, testable: reason === null, untestableReason: reason }
  })
}

function untestableReason(
  pad: ParsedPad,
  footprints: Footprint[] | null,
  maskOpenings: MaskOpening[] | null,
  holes: DrillHole[]
): string | null {
  if (pad.side !== 'top') return 'on the bottom side'
  if (pad.x_size === null || pad.y_size === null) return 'size unknown'
  // The probe aims at the centre; on a through-hole pad that is the hole.
  if (holes.some((hole) => Math.hypot(hole.x - pad.x, hole.y - pad.y) <= hole.diameter / 2)) {
    return 'centred on a drilled hole'
  }
  if (maskOpenings !== null) {
    const tolerance = MASK_OPENING_TOLERANCE_MM / MM_PER_INCH
    const exposed = maskOpenings.some(
      (opening) =>
        Math.abs(opening.x - pad.x) <= tolerance && Math.abs(opening.y - pad.y) <= tolerance
    )
    if (!exposed) return 'covered by solder mask'
  }
  // Sizes come in inches; rounding keeps a 0.6 mm pad from failing a 0.6 mm limit.
  const smallestSideMm = Number((Math.min(pad.x_size, pad.y_size) * MM_PER_INCH).toFixed(3))
  if (smallestSideMm < MIN_PAD_SIZE_MM) {
    return `smaller than ${MIN_PAD_SIZE_MM} mm`
  }
  if (footprints === null) return null

  const x = pad.x * MM_PER_INCH
  const y = pad.y * MM_PER_INCH
  for (const box of footprints) {
    if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) {
      return `under ${box.name}`
    }
  }
  for (const box of footprints) {
    const dx = Math.max(box.minX - x, 0, x - box.maxX)
    const dy = Math.max(box.minY - y, 0, y - box.maxY)
    if (Math.hypot(dx, dy) < PROBE_CLEARANCE_MM) return `too close to ${box.name}`
  }
  return null
}
