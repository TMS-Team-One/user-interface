export interface Test {
  id: number
  testName: string
  createdAt: string
  fileName: string
  gerberFileContent: string
}

export type TestSummary = Omit<Test, 'gerberFileContent'>

export interface ParsedPad {
  x: number
  y: number
  unit: string
  source: string
  dcode: number | null
  aperture_shape: string | null
  aperture_params: string | null
  aperture_function: string | null
  net_name: string | null
  x_size: number | null
  y_size: number | null
}

export interface BoardBounds {
  min_x: number
  min_y: number
  max_x: number
  max_y: number
  x_size: number
  y_size: number
  unit: string
}

export interface GerberParseResult {
  pads: ParsedPad[]
  bounds: BoardBounds | null
}
