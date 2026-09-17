import type { BoardRender } from '@shared/types'

// Spacing of the points taken along the outline, in millimetres.
const STEP_MM = 1

/**
 * The board's outline as points in board millimetres, taken from the clipPath
 * pcb-stackup writes into the top render. Its coordinates are Gerber units x
 * 1000 in the Gerber's own frame (y up), so no flip is needed. Empty when the
 * render has no outline layer.
 */
export function outlineFromRender(render: BoardRender): [number, number][] {
  const doc = new DOMParser().parseFromString(render.topSvg, 'image/svg+xml')
  const d = doc.querySelector('clipPath[id$="_outline"] path')?.getAttribute('d')
  if (!d) return []
  const unitsToMm = (render.units === 'mm' ? 1 : 25.4) / 1000
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  const length = path.getTotalLength()
  const step = STEP_MM / unitsToMm
  const points: [number, number][] = []
  for (let at = 0; at < length; at += step) {
    const point = path.getPointAtLength(at)
    points.push([
      Number((point.x * unitsToMm).toFixed(3)),
      Number((point.y * unitsToMm).toFixed(3))
    ])
  }
  return points
}
