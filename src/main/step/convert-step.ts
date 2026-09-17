import createWorker from './step-worker?nodeWorker'

/** Converts a STEP file to packed meshes (see shared/mesh-pack.ts) on a worker thread. */
export function convertStep(content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = createWorker({ workerData: { content } })
    worker.once('message', (packed: ArrayBuffer) => resolve(Buffer.from(packed)))
    worker.once('error', reject)
  })
}
