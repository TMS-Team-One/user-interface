import whatsThatGerber from 'whats-that-gerber'
import type { LayerAssignment, LayerSide, LayerType } from './types'

// Gerber X2 file attribute, e.g. %TF.FileFunction,Copper,L1,Top,Signal*%. Older
// exports write the same attribute as a "G04 #@! TF..." comment. Authoritative
// when present, which is how Altium's descriptive "*_Copper_Signal_Top.gbr"
// names get identified even though no filename convention covers them.
const FILE_FUNCTION_RE = /(?:%|G04 #@! )TF\.FileFunction,([^*%]+)\*/

const FILE_FUNCTION_TYPES: Record<string, LayerType> = {
  copper: 'copper',
  soldermask: 'soldermask',
  legend: 'silkscreen',
  paste: 'solderpaste',
  profile: 'outline',
  plated: 'drill',
  nonplated: 'drill'
}

// Every Excellon drill file opens its header with M48.
const EXCELLON_HEADER_RE = /^M48\s*$/m

const NOT_DRAWN: LayerAssignment = { layerType: null, layerSide: null }

function fromFileFunction(content: string): LayerAssignment | null {
  const match = FILE_FUNCTION_RE.exec(content)
  if (!match) return null

  const [fileFunction, ...args] = match[1].split(',')
  const layerType = FILE_FUNCTION_TYPES[fileFunction.toLowerCase()]
  // A known function that is not part of the board picture, e.g. Keep-out or AssemblyDrawing.
  if (!layerType) return NOT_DRAWN
  return { layerType, layerSide: sideFromArgs(args) }
}

function sideFromArgs(args: string[]): LayerSide {
  if (args.includes('Top')) return 'top'
  if (args.includes('Bot')) return 'bottom'
  if (args.includes('Inr')) return 'inner'
  return 'all'
}

// Filename conventions of common CAD tools (.GTL, -F_Cu.gbr, .drl, ...). Note that
// Altium's mechanical layers (.GM1 ... .GM16) all come back as "outline" here,
// while only one of them is the real board outline.
function fromFileName(fileName: string, content: string): LayerAssignment {
  const { type, side } = whatsThatGerber([fileName])[fileName]
  if (type === null || type === 'drawing') return NOT_DRAWN
  // ".txt" is Altium's drill extension, but also the extension of its plain-text reports.
  if (type === 'drill' && !EXCELLON_HEADER_RE.test(content)) return NOT_DRAWN
  return { layerType: type, layerSide: side }
}

/** Best guess at which board layer a file is. The upload dialog lets the user correct it. */
export function identifyLayer(fileName: string, content: string): LayerAssignment {
  return fromFileFunction(content) ?? fromFileName(fileName, content)
}
