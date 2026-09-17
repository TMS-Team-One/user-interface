/**
 * Binary container for triangle meshes, used to keep a converted STEP model
 * in the database and hand it to the renderer: a JSON header with the
 * per-mesh metadata and array lengths, followed by the raw typed arrays.
 */
export interface PackedMesh {
  name: string
  /** RGB in 0..1, or null when the model carries no colour for this mesh. */
  color: [number, number, number] | null
  positions: Float32Array
  normals: Float32Array | null
  indices: Uint32Array
}

interface MeshHeader {
  name: string
  color: [number, number, number] | null
  positionCount: number
  normalCount: number
  indexCount: number
}

const HEADER_LENGTH_BYTES = 4

// The typed arrays after the header must start on a four-byte boundary.
const bodyOffset = (headerLength: number): number =>
  HEADER_LENGTH_BYTES + Math.ceil(headerLength / 4) * 4

export function packMeshes(meshes: PackedMesh[]): ArrayBuffer {
  const headers: MeshHeader[] = meshes.map((mesh) => ({
    name: mesh.name,
    color: mesh.color,
    positionCount: mesh.positions.length,
    normalCount: mesh.normals?.length ?? 0,
    indexCount: mesh.indices.length
  }))
  const headerBytes = new TextEncoder().encode(JSON.stringify(headers))
  const bodyBytes = meshes.reduce(
    (sum, mesh) =>
      sum + (mesh.positions.length + (mesh.normals?.length ?? 0) + mesh.indices.length) * 4,
    0
  )
  const buffer = new ArrayBuffer(bodyOffset(headerBytes.length) + bodyBytes)
  const view = new DataView(buffer)
  view.setUint32(0, headerBytes.length, true)
  new Uint8Array(buffer, HEADER_LENGTH_BYTES, headerBytes.length).set(headerBytes)

  let offset = bodyOffset(headerBytes.length)
  for (const mesh of meshes) {
    for (const array of [mesh.positions, mesh.normals, mesh.indices]) {
      if (!array) continue
      new Uint8Array(buffer, offset, array.byteLength).set(
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
      )
      offset += array.byteLength
    }
  }
  return buffer
}

export function unpackMeshes(buffer: ArrayBuffer): PackedMesh[] {
  const headerLength = new DataView(buffer).getUint32(0, true)
  const headers = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, HEADER_LENGTH_BYTES, headerLength))
  ) as MeshHeader[]

  let offset = bodyOffset(headerLength)
  const take = <T extends Float32Array | Uint32Array>(
    Type: new (buffer: ArrayBuffer, offset: number, length: number) => T,
    length: number
  ): T => {
    const array = new Type(buffer, offset, length)
    offset += length * 4
    return array
  }
  return headers.map((header) => ({
    name: header.name,
    color: header.color,
    positions: take(Float32Array, header.positionCount),
    normals: header.normalCount > 0 ? take(Float32Array, header.normalCount) : null,
    indices: take(Uint32Array, header.indexCount)
  }))
}
