import type { GerberParseResult, TestSummary } from '@shared/types'
import { useEffect, useState } from 'react'
import GerberViewer from './GerberViewer'

const CircuitBoardContent = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  const [result, setResult] = useState<GerberParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    window.api.parsing
      .parseGerber(testCase.id)
      .then((parsedResult) => {
        if (!cancelled) setResult(parsedResult)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })

    return () => {
      cancelled = true
    }
  }, [testCase.id])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <GerberViewer
        testCase={testCase}
        pads={result?.pads ?? null}
        bounds={result?.bounds ?? null}
      />
      <div className="shrink-0 text-xs text-muted-foreground" role="status">
        {error ? (
          <span className="text-destructive">Could not parse probe candidates: {error}</span>
        ) : result ? (
          <span>
            {result.pads.length} probe candidates found
            {result.bounds
              ? ` · Board size: ${result.bounds.x_size.toFixed(3)} × ${result.bounds.y_size.toFixed(3)} ${result.bounds.unit}`
              : ''}
          </span>
        ) : (
          <span>Finding probe candidates…</span>
        )}
      </div>
    </div>
  )
}

const CircuitBoard = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => (
  <CircuitBoardContent key={testCase.id} testCase={testCase} />
)

export default CircuitBoard
