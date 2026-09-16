import type { TestSummary } from '@shared/types'
import { Logs as LogsIcon } from 'lucide-react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'

const Logs = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LogsIcon />
        </EmptyMedia>
        <EmptyTitle>No logs yet</EmptyTitle>
        <EmptyDescription>
          Test run logs for &quot;{testCase.testName}&quot; will show up here once the probe
          starts reporting results.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export default Logs
