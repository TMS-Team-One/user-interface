import type { ChatTurn, ProjectSummary } from '@shared/types'
import { useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Input } from '@/components/ui/input'

interface Shown extends ChatTurn {
  tools?: string[]
}

// One conversation per project, answered by probe-pilot's LangGraph agent, which
// looks at the project through its tools.
const ChatPanel = ({ project }: { project: ProjectSummary }): React.JSX.Element => {
  const [messages, setMessages] = useState<Shown[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)

  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || pending) return
    const history: ChatTurn[] = [...messages, { role: 'user', content: text }]
    setMessages(history)
    setDraft('')
    setPending(true)
    try {
      const reply = await window.api.chat.send(project.id, history)
      setMessages([
        ...history,
        {
          role: 'assistant',
          content: reply.error ? `The agent could not answer: ${reply.error}` : reply.text,
          tools: reply.tools
        }
      ])
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setMessages([
        ...history,
        { role: 'assistant', content: `The agent could not answer: ${reason}` }
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
        {messages.length === 0 && (
          <p className="my-auto text-center text-sm text-muted-foreground">
            Ask anything about {project.name}.
          </p>
        )}
        {messages.map((message, index) => (
          <Bubble
            key={index}
            variant={message.role === 'user' ? 'default' : 'muted'}
            align={message.role === 'user' ? 'end' : 'start'}
          >
            <BubbleContent>{message.content}</BubbleContent>
            {message.tools && message.tools.length > 0 && (
              <span className="px-1 text-xs text-muted-foreground">
                looked up: {message.tools.join(', ')}
              </span>
            )}
          </Bubble>
        ))}
        {pending && (
          <Bubble variant="muted" align="start">
            <BubbleContent className="animate-pulse">Thinking...</BubbleContent>
          </Bubble>
        )}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Ask about ${project.name}`}
          aria-label="Chat message"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || pending} aria-label="Send">
          <SendHorizontal />
        </Button>
      </form>
    </div>
  )
}

export default ChatPanel
