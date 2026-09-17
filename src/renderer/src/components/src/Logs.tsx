import type { BoardPose, ProjectSummary } from '@shared/types'
import { Logs as LogsIcon, Square, TestTube } from 'lucide-react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Button } from '../ui/button'
import { useConnection } from '@/hooks/use-connection'
import type { LiveRun } from '@/hooks/use-live-run'
import { useEffect, useState } from 'react'
import { Result } from './StreamingResults'

const BACKEND_LABELS = { ultimaker: 'Ultimaker', simulated: 'simulated printer' }
const INSTRUMENT_LABELS = { ads1115: 'ADS1115 meter', simulated: 'simulated meter' }

const Logs = ({ project, run }: { project: ProjectSummary; run: LiveRun }): React.JSX.Element => {
  const { connectionEstablished } = useConnection()
  const [starting, setStarting] = useState(false)
  const [pose, setPose] = useState<BoardPose | null>(null)

  useEffect(() => {
    let stale = false
    window.api.projects.getPose(project.id).then((saved) => {
      if (!stale) setPose(saved)
    })
    return () => {
      stale = true
    }
  }, [project.id])

  const poseLine = pose
    ? `Board pose from the camera sync: origin (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) mm, ${pose.rotation_deg.toFixed(2)} deg.`
    : 'Board pose: not synced yet, the run uses the default pose. Sync it in the Live View tab.'

  const start = async (): Promise<void> => {
    setStarting(true)
    try {
      await window.api.live.start(project.id)
    } catch (error) {
      console.error('Failed to start the test run', error)
    } finally {
      setStarting(false)
    }
  }

  if (!run.running && run.contacts.length === 0 && run.error === null) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LogsIcon />
          </EmptyMedia>
          <EmptyTitle>No logs yet</EmptyTitle>
          <EmptyDescription className="flex flex-col items-center gap-3">
            {connectionEstablished ? (
              <>Run a test over the testable pads to see results here. {poseLine}</>
            ) : (
              <>
                No connection to the probe. Connect it to start seeing logs for &quot;
                {project.name}&quot;.
              </>
            )}
            <Button disabled={!connectionEstablished || starting} className="w-fit" onClick={start}>
              <TestTube></TestTube>
              {starting ? 'Starting...' : 'Perform tests'}
            </Button>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-xs text-muted-foreground">{poseLine}</p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {run.contacts.length} of {run.targets} pads
          {run.backend && ` on the ${BACKEND_LABELS[run.backend]}`}
          {run.instrument && `, ${INSTRUMENT_LABELS[run.instrument]}`}
        </span>
        {run.running ? (
          <Button size="sm" variant="secondary" onClick={() => window.api.live.stop()}>
            <Square></Square>Stop
          </Button>
        ) : (
          <Button size="sm" disabled={starting} onClick={start}>
            <TestTube></TestTube>
            {starting ? 'Starting...' : 'Run again'}
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {run.contacts.map((contact) => (
          <Result
            key={contact.target.index}
            label={contact.target.label}
            value={`${contact.voltage.toFixed(2)} V`}
            status="success"
          />
        ))}
        {run.error && <Result label="runner" value={run.error} status="error" final />}
        {!run.running && run.error === null && (
          <Result label="testResult" value="Run finished." status="success" final />
        )}
      </div>
    </div>
  )
}

export default Logs
