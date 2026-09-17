import { mkdir, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Project } from '../../shared/types'

/**
 * Writes the files the board localisation reads into `dir`: the drill files
 * under their own names and the top solder mask under a fixed .gts name, since
 * cad_features.load finds drills by their M48 header and the mask by its name.
 * Whatever was in the folder before is removed.
 */
export async function writeCadFiles(project: Project, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const stale of await readdir(dir)) await rm(join(dir, stale), { force: true })
  for (const file of project.files) {
    if (file.kind === 'drill') await writeFile(join(dir, file.fileName), file.content)
    if (file.layerType === 'soldermask' && file.layerSide === 'top') {
      await writeFile(join(dir, 'top-solder-mask.gts'), file.content)
    }
  }
}
