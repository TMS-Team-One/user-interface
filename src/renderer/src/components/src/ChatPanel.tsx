import { Alert, AlertDescription } from '@/components/ui/alert'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea
} from '@/components/ui/input-group'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '@/components/ui/message-scroller'
import { Spinner } from '@/components/ui/spinner'
import { useConnection } from '@/hooks/use-connection'
import type {
  ChatEvent,
  ChatMessageItem,
  ChatTimelineItem,
  ChatToolItem,
  TestSummary
} from '@shared/types'
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CornerDownLeft,
  Search,
  Sparkles
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

function ChatPanel({ testCase }: { testCase: TestSummary }): React.JSX.Element {
  const { connectionEstablished, setPrinterHomed } = useConnection()
  const [items, setItems] = useState<ChatTimelineItem[]>([])
  const [draft, setDraft] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [thinking, setThinking] = useState<string>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const activeRunId = useRef<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    const unsubscribe = window.api.chat.onEvent((envelope) => {
      if (envelope.testId !== testCase.id || envelope.runId !== activeRunId.current || cancelled) {
        return
      }
      applyEvent(envelope.event, setItems, setStreamingText, setThinking, setPrinterHomed)
    })

    window.api.chat
      .history(testCase.id)
      .then((result) => {
        if (!cancelled) setItems(result.items)
      })
      .catch((caughtError) => {
        if (!cancelled) setError(hardwareErrorMessage(caughtError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [setPrinterHomed, testCase.id])

  const sendMessage = async (): Promise<void> => {
    const message = draft.trim()
    if (!message || running || !connectionEstablished) return

    const runId = crypto.randomUUID()
    activeRunId.current = runId
    setDraft('')
    setError(undefined)
    setThinking('Starting a new agent run…')
    setStreamingText('')
    setRunning(true)
    setItems((current) => [
      ...current,
      { type: 'message', id: `local-${runId}`, role: 'user', content: message }
    ])

    try {
      const result = await window.api.chat.send({ runId, testId: testCase.id, message })
      setItems(result.items)
    } catch (caughtError) {
      setError(hardwareErrorMessage(caughtError))
    } finally {
      setRunning(false)
      setThinking(undefined)
      setStreamingText('')
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div className="flex size-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <MessageScrollerProvider>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-5 p-4">
              {!loading && items.length === 0 && !running ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
                  <div className="rounded-full bg-muted p-3">
                    <Bot className="size-6" />
                  </div>
                  <h2 className="font-medium">Chat with ProbePilot</h2>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Ask the agent to inspect positions, move the probe, or take voltage
                    measurements. The printer will home automatically before the first message.
                  </p>
                </div>
              ) : null}

              {groupTimelineItems(items).map((group) => (
                <MessageScrollerItem key={group.id}>
                  {group.type === 'message' ? (
                    <ChatMessage item={group.item} />
                  ) : (
                    <ToolActivityGroup items={group.items} />
                  )}
                </MessageScrollerItem>
              ))}

              {thinking && (
                <MessageScrollerItem>
                  <Marker>
                    <MarkerIcon>
                      <Sparkles />
                    </MarkerIcon>
                    <MarkerContent className="shimmer">{thinking}</MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              )}

              {streamingText && (
                <MessageScrollerItem>
                  <ChatMessage
                    item={{
                      type: 'message',
                      id: 'streaming-assistant',
                      role: 'assistant',
                      content: streamingText
                    }}
                  />
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="border-t p-3">
        {!connectionEstablished && (
          <Alert className="mb-3">
            <CircleAlert />
            <AlertDescription>
              Connect the Ultimaker from the sidebar before starting the autonomous agent.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-3">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <InputGroup className="items-end">
          <InputGroupTextarea
            value={draft}
            rows={2}
            placeholder="Ask ProbePilot to move or measure…"
            disabled={loading || running || !connectionEstablished}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <InputGroupAddon align="block-end" className="justify-between">
            <span className="text-xs text-muted-foreground">
              Enter to send · Shift+Enter for newline
            </span>
            <InputGroupButton
              size="icon-sm"
              variant="default"
              disabled={!draft.trim() || loading || running || !connectionEstablished}
              onClick={() => void sendMessage()}
              aria-label="Send message"
            >
              {running ? <Spinner /> : <CornerDownLeft />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  )
}

function ChatMessage({ item }: { item: ChatMessageItem }): React.JSX.Element {
  const assistant = item.role === 'assistant'
  return (
    <Message align={assistant ? 'start' : 'end'}>
      <MessageContent>
        <Bubble align={assistant ? 'start' : 'end'} variant={assistant ? 'secondary' : 'default'}>
          <BubbleContent className="whitespace-pre-wrap">{item.content}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

function ToolActivityGroup({ items }: { items: ChatToolItem[] }): React.JSX.Element {
  const running = items.some((item) => item.status === 'running')
  const actionLabel = `${items.length} ${items.length === 1 ? 'action' : 'actions'}`

  return (
    <div className="ml-1 max-w-3xl border-l border-border/80 py-0.5 pl-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        <span>{running ? `Using ${actionLabel}…` : `Used ${actionLabel}`}</span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <ToolActivity key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

function ToolActivity({ item }: { item: ChatToolItem }): React.JSX.Element {
  const ToolIcon = item.name === 'measure_voltage' ? Search : ArrowUpRight
  const icon =
    item.status === 'running' ? (
      <Spinner className="size-3.5" />
    ) : item.status === 'success' ? (
      <Check className="size-4 text-muted-foreground" />
    ) : (
      <CircleAlert className="size-4 text-destructive" />
    )
  const context = toolContext(item)
  const hasDetails = Object.keys(item.args).length > 0 || item.result !== undefined

  return (
    <div className="min-w-0 py-0.5 text-sm">
      <div className="flex min-w-0 items-start gap-1.5">
        <ToolIcon
          className={`mt-0.5 size-3.5 shrink-0 text-muted-foreground ${
            item.name === 'measure_voltage' ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={item.status === 'error' ? 'font-medium' : 'text-muted-foreground'}>
              {toolLabel(item.name, item.status)}
            </span>
            {context && <span className="text-xs text-muted-foreground/80">{context}</span>}
          </div>
          {item.error && <p className="mt-0.5 text-xs text-destructive">{item.error}</p>}
          {hasDetails && (
            <details className="group/details mt-0.5 text-xs text-muted-foreground">
              <summary className="inline-flex cursor-pointer list-none items-center gap-0.5 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3 transition-transform group-open/details:rotate-90" />
                Details
              </summary>
              <pre className="mt-1.5 overflow-auto whitespace-pre-wrap border-l pl-3 font-mono text-[11px] leading-relaxed">
                {JSON.stringify({ input: item.args, result: item.result }, null, 2)}
              </pre>
            </details>
          )}
        </div>
        <span
          className="mt-0.5 flex size-4 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
    </div>
  )
}

type TimelineGroup =
  | { type: 'message'; id: string; item: ChatMessageItem }
  | { type: 'tools'; id: string; items: ChatToolItem[] }

function groupTimelineItems(items: ChatTimelineItem[]): TimelineGroup[] {
  return items.reduce<TimelineGroup[]>((groups, item) => {
    if (item.type === 'message') {
      groups.push({ type: 'message', id: item.id, item })
      return groups
    }

    const previous = groups.at(-1)
    if (previous?.type === 'tools') {
      previous.items.push(item)
    } else {
      groups.push({ type: 'tools', id: `tools-${item.id}`, items: [item] })
    }
    return groups
  }, [])
}

function applyEvent(
  event: ChatEvent,
  setItems: React.Dispatch<React.SetStateAction<ChatTimelineItem[]>>,
  setStreamingText: React.Dispatch<React.SetStateAction<string>>,
  setThinking: React.Dispatch<React.SetStateAction<string | undefined>>,
  setPrinterHomed: React.Dispatch<React.SetStateAction<boolean>>
): void {
  if (event.type === 'thinking') {
    setThinking(event.message)
    return
  }
  if (event.type === 'assistant-delta') {
    setThinking(undefined)
    setStreamingText((current) => current + event.content)
    return
  }
  if (event.type === 'assistant-completed') {
    setStreamingText('')
    setThinking(undefined)
    upsertItem(setItems, event.item)
    return
  }

  setStreamingText('')
  setThinking(undefined)
  upsertItem(setItems, event.item)
  if (event.item.name === 'home_printer') {
    setPrinterHomed(event.type === 'tool-completed')
  }
}

function upsertItem(
  setItems: React.Dispatch<React.SetStateAction<ChatTimelineItem[]>>,
  item: ChatTimelineItem
): void {
  setItems((current) => {
    const index = current.findIndex((candidate) => candidate.id === item.id)
    if (index === -1) return [...current, item]
    return current.map((candidate, candidateIndex) => (candidateIndex === index ? item : candidate))
  })
}

function toolLabel(name: string, status: ChatToolItem['status']): string {
  const labels: Record<string, Record<ChatToolItem['status'], string>> = {
    home_printer: {
      running: 'Homing printer…',
      success: 'Homed printer',
      error: 'Could not home printer'
    },
    is_printer_reachable: {
      running: 'Checking printer connection…',
      success: 'Checked printer connection',
      error: 'Could not check printer connection'
    },
    get_printer_position: {
      running: 'Reading printer position…',
      success: 'Read printer position',
      error: 'Could not read printer position'
    },
    move_printer_to: {
      running: 'Moving probe…',
      success: 'Moved probe',
      error: 'Could not move probe'
    },
    measure_voltage: {
      running: 'Measuring voltage…',
      success: 'Measured voltage',
      error: 'Could not measure voltage'
    }
  }
  return labels[name]?.[status] || name.replaceAll('_', ' ')
}

function toolContext(item: ChatToolItem): string | undefined {
  const result = asRecord(item.result)
  const position = asRecord(result?.position)
  if (position) return formatPosition(position)

  if (item.name === 'move_printer_to') return formatPosition(item.args)

  if (item.name === 'measure_voltage' && typeof result?.voltage === 'number') {
    const unit = typeof result.unit === 'string' ? result.unit : 'V'
    return `${result.voltage.toFixed(3)} ${unit}`
  }

  if (item.name === 'is_printer_reachable' && typeof result?.reachable === 'boolean') {
    return result.reachable ? 'Reachable' : 'Not reachable'
  }
  return undefined
}

function formatPosition(position: Record<string, unknown>): string | undefined {
  const { x, y, z } = position
  if (![x, y, z].every((coordinate) => typeof coordinate === 'number')) return undefined
  return `X ${x} · Y ${y} · Z ${z} mm`
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function hardwareErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
}

export default ChatPanel
