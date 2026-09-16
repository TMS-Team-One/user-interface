export interface Test {
  id: number
  testName: string
  createdAt: string
  fileName: string
  gerberFileContent: string
}

export type TestSummary = Omit<Test, 'gerberFileContent'>

export interface ParsedPad {
  x: number
  y: number
  unit: string
  source: string
  dcode: number | null
  aperture_shape: string | null
  aperture_params: string | null
  aperture_function: string | null
  net_name: string | null
}

export interface ProbeConnectionStatus {
  connected: boolean
  homed: boolean
}

export interface ManualProbeCoordinates {
  x: number
  y: number
  z: number
}

export interface ManualProbeResult {
  target: ManualProbeCoordinates
  voltage: number
  unit: 'V'
  retracted: boolean
}

export interface ChatMessageItem {
  type: 'message'
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ChatToolItem {
  type: 'tool'
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  result?: unknown
  error?: string
}

export type ChatTimelineItem = ChatMessageItem | ChatToolItem

export type ChatEvent =
  | { type: 'thinking'; message: string }
  | { type: 'assistant-delta'; content: string }
  | { type: 'assistant-completed'; item: ChatMessageItem }
  | { type: 'tool-started'; item: ChatToolItem }
  | { type: 'tool-completed'; item: ChatToolItem }
  | { type: 'tool-failed'; item: ChatToolItem }

export interface ChatEventEnvelope {
  runId: string
  testId: number
  event: ChatEvent
}

export interface ChatSendRequest {
  runId: string
  testId: number
  message: string
}

export interface ChatResult {
  items: ChatTimelineItem[]
}
