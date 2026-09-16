import type { ParsedPad, TestSummary } from '@shared/types'
import { useEffect, useState } from 'react'
import GerberViewer from './GerberViewer'

const CircuitBoardContent = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  const [pads, setPads] = useState<ParsedPad[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    window.api.parsing
      .parseGerber(testCase.id)
      .then((parsedPads) => {
        if (!cancelled) setPads(parsedPads)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })

    return () => {
      cancelled = true
    }
  }, [testCase.id])

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <GerberViewer testCase={testCase} />
      <div className="shrink-0 text-xs text-muted-foreground" role="status">
        {error ? (
          <span className="text-destructive">Could not parse probe candidates: {error}</span>
        ) : pads ? (
          <span>{pads.length} probe candidates found</span>
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
