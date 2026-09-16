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
}
