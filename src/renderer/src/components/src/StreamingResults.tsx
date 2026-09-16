import { cn } from 'cn'

const ReasoningStep = ({
  label,
  description,
  isStreaming = false
}: {
  label: string
  description?: string
  isStreaming?: boolean
}): React.JSX.Element => {
  if (isStreaming) {
    return (
      <div className="flex items-baseline gap-1.5 text-sm">
        <span className="text-primary animate-pulse">●</span>
        <span className="text-black font-extrabold">{label}</span>
      </div>
    )
  }

  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      <span className="text-muted-foreground">●</span>
      <span>
        <span className="font-bold text-md text-muted-foreground">{label}</span>
        {description && <span className="text-muted-foreground"> {description}</span>}
      </span>
    </div>
  )
}

type ResultStatus = 'pending' | 'success' | 'error'

const Result = ({
  label,
  value,
  status = 'pending',
  final = false
}: {
  label: string
  value: string
  status?: ResultStatus
  final?: boolean
}): React.JSX.Element => {
  const statusColor = {
    pending: 'text-muted-foreground',
    success: 'text-lime-600',
    error: 'text-red-600'
  }[status]

  return (
    <p className={cn('text-sm leading-relaxed', final && 'font-medium')}>
      <span className={statusColor}>●</span>{' '}
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{label}</code>
      <span className="text-muted-foreground">{' - '}</span>
      <span className="text-muted-foreground">{value}</span>
    </p>
  )
}

const StreamingResults = (): React.JSX.Element => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <ReasoningStep label="Thinking..." isStreaming />
        <ReasoningStep label="Bash" description="Re-run type-check after removing unused import" />
      </div>
      <div className="flex flex-col gap-1">
        <Result label="continuityCheck" value="Waiting for probe" status="pending" />
        <Result label="continuityCheck" value="Within tolerance" status="success" />
        <Result label="shortCircuitCheck" value="Out of tolerance" status="error" />
        <Result
          label="testResult"
          value="All checks completed successfully."
          status="success"
          final
        />
        <Result label="testResult" value="One or more checks failed." status="error" final />
      </div>
    </div>
  )
}

export default StreamingResults
export { ReasoningStep, Result }
