import type { BoardRender } from '@shared/types'
import { useEffect, useState } from 'react'

/**
 * Loads the top and bottom renders of a project's board. Mount the calling
 * component with `key={projectId}` so a change of project starts from a clean
 * state; a response for a project that is no longer shown is dropped.
 */
export function useBoardRender(projectId: number): {
  render: BoardRender | null
  error: string | null
} {
  const [render, setRender] = useState<BoardRender | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    window.api.parsing
      .renderBoard(projectId)
      .then((board) => {
        if (!stale) setRender(board)
      })
      .catch((err) => {
        if (!stale) setError(String(err))
      })
    return () => {
      stale = true
    }
  }, [projectId])

  return { render, error }
}
