import { parentPort, workerData } from 'node:worker_threads'
import occtImportJs from 'occt-import-js'
import { packMeshes, type PackedMesh } from '../../shared/mesh-pack'

// Runs on a worker thread: reading a full board takes seconds of CPU, which
// must not stall the main process.
async function convert(content: string): Promise<ArrayBuffer> {
  const occt = await occtImportJs()
  const result = occt.ReadStepFile(new TextEncoder().encode(content), null)
  if (!result.success) throw new Error('STEP file could not be read')

  const meshes: PackedMesh[] = result.meshes.map((mesh) => ({
    name: mesh.name,
    color: mesh.color ? [mesh.color[0], mesh.color[1], mesh.color[2]] : null,
    positions: Float32Array.from(mesh.attributes.position.array),
    normals: mesh.attributes.normal ? Float32Array.from(mesh.attributes.normal.array) : null,
    indices: Uint32Array.from(mesh.index.array)
  }))
  return packMeshes(meshes)
}

convert(workerData.content as string).then(
  (packed) => parentPort?.postMessage(packed, [packed]),
  (error) => {
    throw error
  }
)
