import { unpackMeshes, type PackedMesh } from '@shared/mesh-pack'
import { useEffect, useState } from 'react'

/**
 * Loads a project's converted STEP model. `undefined` while loading, `null`
 * when the project has no model. Mount the caller with `key={projectId}`.
 */
export function useProjectModel(projectId: number): PackedMesh[] | null | undefined {
  const [model, setModel] = useState<PackedMesh[] | null | undefined>(undefined)

  useEffect(() => {
    let stale = false
    window.api.projects
      .getModel(projectId)
      .then((buffer) => {
        if (!stale) setModel(buffer ? unpackMeshes(buffer) : null)
      })
      .catch((err) => {
        console.error('Could not load the project model', err)
        if (!stale) setModel(null)
      })
    return () => {
      stale = true
    }
  }, [projectId])

  return model
}
