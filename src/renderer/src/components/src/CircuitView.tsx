import type { GerberParseResult, ProjectSummary } from '@shared/types'
import { useEffect, useState } from 'react'
import GerberViewer from './GerberViewer'

const CircuitView = ({ project }: { project: ProjectSummary }): React.JSX.Element => {
  const [result, setResult] = useState<GerberParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Pad parsing takes seconds; a previous project's pads must not land on this one.
    let stale = false
    window.api.parsing
      .parsePads(project.id)
      .then((parsed) => {
        if (!stale) setResult(parsed)
      })
      .catch((err) => {
        if (!stale) setError(String(err))
      })
    return () => {
      stale = true
    }
  }, [project.id])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <GerberViewer project={project} pads={result?.pads ?? null} />
      {
        <div className="max-h-48 shrink-0 overflow-auto">
          {error && <pre className="text-destructive">{error}</pre>}
          {result && (
            <p className="text-sm text-muted-foreground">
              {result.pads.filter((pad) => pad.testable).length} testable pads of{' '}
              {result.pads.filter((pad) => pad.side === 'top').length} on the top side, green in the
              view; hover a marker for the reason.
            </p>
          )}
          {result && <pre>{JSON.stringify(result.pads, null, 2)}</pre>}
        </div>
      }
    </div>
  )
}

export default CircuitView
