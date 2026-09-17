import pcbStackup from 'pcb-stackup'
import type { BoardRender, ProjectFile } from '../../shared/types'

/**
 * Renders the top and bottom views of a board from its layer files. Files
 * without a layer type are left out. When an outline layer is present the
 * render is clipped to the board's shape.
 */
export async function renderBoard(files: ProjectFile[], id: string): Promise<BoardRender> {
  const layers = files
    .filter((file) => file.layerType !== null)
    .map((file) => ({
      filename: file.fileName,
      gerber: file.content,
      type: file.layerType,
      side: file.layerSide
    }))
  const stackup = await pcbStackup(layers, { id, useOutline: true })

  return {
    topSvg: stackup.top.svg,
    bottomSvg: stackup.bottom.svg,
    units: stackup.top.units,
    width: stackup.top.width,
    height: stackup.top.height
  }
}
