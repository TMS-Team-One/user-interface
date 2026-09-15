export interface Test {
  id: number
  testName: string
  createdAt: string
  fileName: string
  gerberFileContent: string
}

export type TestSummary = Omit<Test, 'gerberFileContent'>
