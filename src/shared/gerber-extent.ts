// The extent of what a Gerber file draws, in millimetres, and how many drawing
// operations it takes. Enough to tell a board outline (a few segments spanning
// the board) from an empty layer or one full of component outlines.

const FORMAT_RE = /%FS([LT])?[AI]?X(\d)(\d)Y(\d)(\d)\*%/
const UNIT_RE = /%MO(MM|IN)\*%/
const OPERATION_RE = /(?:X([-+]?\d+))?(?:Y([-+]?\d+))?(?:I[-+]?\d+)?(?:J[-+]?\d+)?D0?([123])\*/g
const MM_PER_INCH = 25.4

export interface GerberExtent {
  width: number
  height: number
  operations: number
}

/** Null when the file draws nothing or declares no coordinate format. */
export function gerberExtent(content: string): GerberExtent | null {
  const format = FORMAT_RE.exec(content)
  if (!format) return null
  const [, zeros, , xDecimals, , yDecimals] = format
  const unitsToMm = UNIT_RE.exec(content)?.[1] === 'IN' ? MM_PER_INCH : 1
  const digits = (decimals: string, integer: string): [number, number] => [
    Number(integer),
    Number(decimals)
  ]
  const [xInt, xDec] = digits(xDecimals, format[2])
  const [yInt, yDec] = digits(yDecimals, format[4])

  // Trailing-zero omission pads the number on the right to its full width.
  const value = (raw: string, integer: number, decimals: number): number => {
    const sign = raw.startsWith('-') ? -1 : 1
    let text = raw.replace(/^[-+]/, '')
    if (zeros === 'T') text = text.padEnd(integer + decimals, '0')
    return (sign * Number(text)) / 10 ** decimals
  }

  let x = 0
  let y = 0
  let operations = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const match of content.matchAll(OPERATION_RE)) {
    const [, rawX, rawY] = match
    if (rawX !== undefined) x = value(rawX, xInt, xDec)
    if (rawY !== undefined) y = value(rawY, yInt, yDec)
    if (rawX === undefined && rawY === undefined) continue
    operations++
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (operations === 0) return null
  return {
    width: (maxX - minX) * unitsToMm,
    height: (maxY - minY) * unitsToMm,
    operations
  }
}
