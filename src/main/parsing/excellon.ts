/**
 * Round holes of an Excellon drill file, in inches like the pads. Same reading
 * as read_excellon in probe-pilot's src/vision/cad_features.py: the header
 * gives the unit, the zero convention and the digit format; the body switches
 * tools and lists hole positions.
 */
export interface DrillHole {
  x: number
  y: number
  diameter: number
}

const MM_PER_INCH = 25.4

function coordinate(text: string, zeros: 'LZ' | 'TZ', digits: [number, number]): number {
  if (text.includes('.')) return Number(text)
  const sign = text.startsWith('-') ? -1 : 1
  const bare = text.replace(/^[-+]/, '')
  const width = digits[0] + digits[1]
  const padded = zeros === 'TZ' ? bare.padStart(width, '0') : bare.padEnd(width, '0')
  return (sign * Number(padded)) / 10 ** digits[1]
}

export function readExcellon(content: string): DrillHole[] {
  const tools = new Map<number, number>()
  const holes: DrillHole[] = []
  let inchesPerUnit = 1
  let zeros: 'LZ' | 'TZ' = 'LZ'
  let digits: [number, number] | null = null
  let diameter: number | null = null
  let x = 0
  let y = 0
  let inBody = false

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!inBody) {
      if (line.startsWith('INCH') || line.startsWith('METRIC')) {
        inchesPerUnit = line.startsWith('INCH') ? 1 : 1 / MM_PER_INCH
        zeros = line.includes('TZ') ? 'TZ' : 'LZ'
      }
      const format = /;FILE_FORMAT=(\d):(\d)/.exec(line)
      if (format) digits = [Number(format[1]), Number(format[2])]
      const tool = /^T(\d+)[A-Z0-9.]*?C([\d.]+)/.exec(line)
      if (tool) tools.set(Number(tool[1]), Number(tool[2]) * inchesPerUnit)
      if (line === '%' || line === 'M95') {
        inBody = true
        digits ??= inchesPerUnit === 1 ? [2, 4] : [3, 3]
      }
      continue
    }
    const select = /^T(\d+)$/.exec(line)
    if (select) {
      diameter = tools.get(Number(select[1])) ?? null
      continue
    }
    const move = /^(?:X(-?[\d.]+))?(?:Y(-?[\d.]+))?$/.exec(line)
    if (!move || diameter === null || (!move[1] && !move[2])) continue
    if (move[1]) x = coordinate(move[1], zeros, digits!) * inchesPerUnit
    if (move[2]) y = coordinate(move[2], zeros, digits!) * inchesPerUnit
    holes.push({ x, y, diameter })
  }
  return holes
}
