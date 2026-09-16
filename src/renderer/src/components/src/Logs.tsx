import type { TestSummary } from '@shared/types'
import { Logs as LogsIcon, TestTube } from 'lucide-react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Button } from '../ui/button'
import { useConnection } from '@/hooks/use-connection'
import { useState } from 'react'
import StreamingResults from './StreamingResults'

const Logs = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  const { connectionEstablished } = useConnection()

  const [testStartedOrAvailable, setTestStartedOrAvailable] = useState<boolean>(false)

  return (
    <>
      {!testStartedOrAvailable && (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LogsIcon />
            </EmptyMedia>
            <EmptyTitle>No logs yet</EmptyTitle>
            <EmptyDescription className="flex flex-col items-center gap-3">
              {connectionEstablished ? (
                <>Run a test to see results here.</>
              ) : (
                <>
                  No connection to the probe. Connect it to start seeing logs for &quot;
                  {testCase.testName}&quot;.
                </>
              )}
              <Button
                disabled={!connectionEstablished}
                className="w-fit"
                onClick={() => setTestStartedOrAvailable((prev) => !prev)}
              >
                <TestTube></TestTube>
                Perform tests
              </Button>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {testStartedOrAvailable && (
        <div className="flex flex-col w-full">
          <div>
            <StreamingResults></StreamingResults>
          </div>
        </div>
      )}
    </>
  )
}

export default Logs
