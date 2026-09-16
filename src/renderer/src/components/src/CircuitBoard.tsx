import type { GerberParseResult, TestSummary } from '@shared/types'
import { useEffect, useState } from 'react'
import GerberViewer from './GerberViewer'

const CircuitBoard = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  const [result, setResult] = useState<GerberParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    setError(null)
    window.api.parsing
      .parseGerber(testCase.id)
      .then(setResult)
      .catch((err) => setError(String(err)))
  }, [testCase.id])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <GerberViewer
        testCase={testCase}
        pads={result?.pads ?? null}
        bounds={result?.bounds ?? null}
      />
      {
        <div className="max-h-48 shrink-0 overflow-auto">
          {error && <pre className="text-destructive">{error}</pre>}
          {result?.bounds && (
            <p className="text-sm text-muted-foreground">
              Board size: {result.bounds.x_size.toFixed(3)} x {result.bounds.y_size.toFixed(3)}{' '}
              {result.bounds.unit}
            </p>
          )}
          {result && <pre>{JSON.stringify(result.pads, null, 2)}</pre>}
        </div>
      }
    </div>
  )
}

export default CircuitBoard
