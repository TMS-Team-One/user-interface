import { identifyLayer } from './gerber-layers'
import type { FileClassification } from './types'

// STEP files open with the ISO 10303-21 header line.
const STEP_RE = /^ISO-10303-21/
// IPC-D-356 test netlists carry "P  " parameter records and 3xx test point records.
const IPC_D_356_RE = /^(?:P {2}(?:JOB|UNITS|CODE)|317|327|307|367)/m
// Altium's Protel netlist opens with a "[" component block and has "(" net blocks.
const PROTEL_RE = /^\uFEFF?\[\r?\n[\s\S]*^\(\r?\n/m
// Excellon drill files open their header with M48.
const EXCELLON_RE = /^M48\s*$/m
// Gerber files declare a coordinate format, unit, aperture or file attribute.
const GERBER_RE = /^%(?:FS|MO|AD|TF)/m

const NOT_A_LAYER = { layerType: null, layerSide: null } as const

/**
 * Tells from the content what a file is. Deterministic; when it comes back
 * "unknown" the upload dialog may ask the AI fallback in the main process.
 */
export function identifyFile(fileName: string, content: string): FileClassification {
  if (STEP_RE.test(content)) return { kind: 'step', ...NOT_A_LAYER }
  if (IPC_D_356_RE.test(content) || PROTEL_RE.test(content))
    return { kind: 'netlist', ...NOT_A_LAYER }
  if (EXCELLON_RE.test(content)) return { kind: 'drill', layerType: 'drill', layerSide: 'all' }
  if (GERBER_RE.test(content)) return { kind: 'gerber', ...identifyLayer(fileName, content) }
  return { kind: 'unknown', ...NOT_A_LAYER }
}
