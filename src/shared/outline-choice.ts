import { gerberExtent } from './gerber-extent'
import type { ProjectFile } from './types'

// A layer counts as spanning the board when it reaches this share of the
// copper's width and height.
const SPANS_BOARD = 0.9

/**
 * Keeps one outline layer. Filename conventions call every Altium mechanical
 * layer an outline, but only one draws the board's edge: it spans the copper
 * with few operations, while the others are empty or full of component
 * outlines. The losers are left out of the render; the dialog still lets the
 * user pick differently.
 */
export function resolveOutline(files: ProjectFile[]): ProjectFile[] {
  const candidates = files.filter((file) => file.layerType === 'outline')
  if (candidates.length < 2) return files

  const copper = files
    .filter((file) => file.layerType === 'copper')
    .map((file) => gerberExtent(file.content))
  const copperWidth = Math.max(0, ...copper.map((extent) => extent?.width ?? 0))
  const copperHeight = Math.max(0, ...copper.map((extent) => extent?.height ?? 0))

  const measured = candidates
    .map((file) => ({ file, extent: gerberExtent(file.content) }))
    .filter((entry) => entry.extent !== null)
    .map((entry) => ({ file: entry.file, extent: entry.extent! }))
  const spanning = measured.filter(
    ({ extent }) =>
      extent.width >= SPANS_BOARD * copperWidth && extent.height >= SPANS_BOARD * copperHeight
  )
  const pool = spanning.length > 0 ? spanning : measured
  const chosen = pool.reduce<(typeof pool)[number] | null>(
    (best, entry) => (!best || entry.extent.operations < best.extent.operations ? entry : best),
    null
  )

  return files.map((file) =>
    file.layerType === 'outline' && file !== chosen?.file
      ? { ...file, layerType: null, layerSide: null }
      : file
  )
}
