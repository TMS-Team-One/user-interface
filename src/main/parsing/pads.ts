import { spawn } from 'child_process'
import { unpackMeshes } from '../../shared/mesh-pack'
import type { ParsedPad, Project } from '../../shared/types'
import { getProjectModel } from '../db/projects.repository'
import { assignNets } from '../netlist/assign-nets'
import { parseIpcD356 } from '../netlist/ipc-d-356'
import { componentFootprints, markTestablePads, type MaskOpening } from '../testing/testable-pads'
import { readExcellon } from './excellon'
import { getGerberParserCommand } from '../python/parser-runtime'

function runGerberParser(stdinInput: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    let parserCommand: ReturnType<typeof getGerberParserCommand>
    try {
      parserCommand = getGerberParserCommand()
    } catch (error) {
      reject(error)
      return
    }
    const py = spawn(parserCommand.command, [...parserCommand.args, ...args], {
      cwd: parserCommand.cwd,
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (chunk) => (stdout += chunk))
    py.stderr.on('data', (chunk) => (stderr += chunk))
    py.on('error', reject)
    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Gerber parser exited with code ${code}`))
        return
      }
      resolve(stdout)
    })

    py.stdin.write(stdinInput)
    py.stdin.end()
  })
}

// The Python parser reports pads for copper layers only; the pads of a top or
// bottom copper file are the ones shown on that side of the board.
async function parseLayerPads(
  file: Project['files'][number],
  side: ParsedPad['side']
): Promise<ParsedPad[]> {
  const stdout = await runGerberParser(file.content, [file.fileName])
  const { pads } = JSON.parse(stdout) as {
    pads: Omit<ParsedPad, 'side' | 'testable' | 'untestableReason'>[]
  }
  return pads.map((pad) => ({ ...pad, side, testable: false, untestableReason: null }))
}

// The openings of the top solder mask are its flashes; the parser reports them
// with "--all-flashes" since it otherwise only looks at copper.
async function parseMaskOpenings(file: Project['files'][number]): Promise<MaskOpening[]> {
  const stdout = await runGerberParser(file.content, [file.fileName, '--all-flashes'])
  const { pads } = JSON.parse(stdout) as { pads: MaskOpening[] }
  return pads.map(({ x, y }) => ({ x, y }))
}

/**
 * Every pad of a project's copper layers: net names from the netlist when there
 * is one, and whether the probe can be put on it, judged against the top solder
 * mask and the STEP model's components when the project has them.
 */
export async function collectPads(project: Project): Promise<ParsedPad[]> {
  const { files } = project
  const jobs: Promise<ParsedPad[]>[] = []
  for (const file of files) {
    if (file.layerType !== 'copper') continue
    if (file.layerSide === 'top' || file.layerSide === 'bottom') {
      jobs.push(parseLayerPads(file, file.layerSide))
    }
  }
  const topMask = files.find((file) => file.layerType === 'soldermask' && file.layerSide === 'top')
  const maskJob = topMask ? parseMaskOpenings(topMask) : Promise.resolve(null)
  let pads = (await Promise.all(jobs)).flat()
  const maskOpenings = await maskJob
  const holes = files
    .filter((file) => file.kind === 'drill')
    .flatMap((file) => readExcellon(file.content))
  const netlist = files.find((file) => file.kind === 'netlist')
  if (netlist) pads = assignNets(pads, parseIpcD356(netlist.content))

  const model = getProjectModel(project.id)
  const footprints = model
    ? componentFootprints(
        unpackMeshes(
          model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength) as ArrayBuffer
        )
      )
    : null
  return markTestablePads(pads, footprints, maskOpenings, holes)
}
