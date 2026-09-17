declare module 'occt-import-js' {
  interface OcctMesh {
    name: string
    color?: number[]
    attributes: { position: { array: number[] }; normal?: { array: number[] } }
    index: { array: number[] }
  }
  interface OcctResult {
    success: boolean
    meshes: OcctMesh[]
  }
  interface Occt {
    ReadStepFile(content: Uint8Array, params: null): OcctResult
  }
  export default function occtImportJs(): Promise<Occt>
}
