import type { ParsedPad, TestSummary } from '@shared/types'
import { useEffect, useState } from 'react'
import GerberViewer from './GerberViewer'

const CircuitBoard = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  const [pads, setPads] = useState<ParsedPad[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPads(null)
    setError(null)
    window.api.parsing
      .parseGerber(testCase.id)
      .then(setPads)
      .catch((err) => setError(String(err)))
  }, [testCase.id])

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <GerberViewer testCase={testCase} />
      {/**<div className="max-h-48 shrink-0 overflow-auto">
        {error && <pre className="text-destructive">{error}</pre>}
        {pads && <pre>{JSON.stringify(pads, null, 2)}</pre>}
      </div> **/}
    </div>
  )
}

export default CircuitBoard
