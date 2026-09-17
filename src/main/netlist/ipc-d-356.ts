/**
 * Reads an IPC-D-356 test netlist: one fixed-column record per test point,
 * giving its net, the component pin it belongs to, its position and which
 * side of the board can reach it. Positions are returned in inches, the unit
 * the pad parser uses.
 */
export interface NetlistPoint {
  net: string
  refdes: string | null
  pin: string | null
  x: number
  y: number
  side: 'top' | 'bottom' | 'both'
  throughHole: boolean
}

// Columns 1-32 are fixed: operation code, net name (14), three blanks, reference
// designator (6), a separator, pin (4) and the mid-point flag. The optional hole
// field (D + diameter + plating) is followed by the access code and the position.
const RECORD_RE =
  /^(317|327|307|367)(.{14}).{3}(.{6}).(.{4}).(?:D\d{4}[PU]|\s{0,6})?A(\d\d)X([-+ ]?\d+)Y([-+ ]?\d+)/

// "P  UNITS CUST n": 0 = 0.0001 inch, 1 = 0.001 mm, 2 = 0.0001 mm.
const INCHES_PER_UNIT: Record<string, number> = {
  '0': 1 / 10000,
  '1': 1 / (1000 * 25.4),
  '2': 1 / (10000 * 25.4)
}

const SIDES: Record<string, NetlistPoint['side']> = { '00': 'both', '01': 'top', '02': 'bottom' }

export function parseIpcD356(content: string): NetlistPoint[] {
  let inchesPerUnit = INCHES_PER_UNIT['0']
  const points: NetlistPoint[] = []

  for (const line of content.split(/\r?\n/)) {
    const units = /^P\s+UNITS\s+CUST\s+(\d)/.exec(line)
    if (units) {
      inchesPerUnit = INCHES_PER_UNIT[units[1]] ?? inchesPerUnit
      continue
    }
    const match = RECORD_RE.exec(line)
    if (!match) continue

    const [, code, net, refdes, pin, access, x, y] = match
    points.push({
      net: net.trim(),
      refdes: refdes.trim() || null,
      pin: pin.trim() || null,
      x: Number(x.replace(' ', '')) * inchesPerUnit,
      y: Number(y.replace(' ', '')) * inchesPerUnit,
      side: SIDES[access] ?? 'both',
      throughHole: code === '317' || code === '307'
    })
  }
  return points
}
