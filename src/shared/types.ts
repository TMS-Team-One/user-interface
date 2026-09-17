export type LayerType = 'copper' | 'soldermask' | 'silkscreen' | 'solderpaste' | 'drill' | 'outline'
export type LayerSide = 'top' | 'bottom' | 'inner' | 'all'

/** Which board layer a Gerber or drill file describes. A null type keeps the file but leaves it out of the render. */
export interface LayerAssignment {
  layerType: LayerType | null
  layerSide: LayerSide | null
}

/** What a project file is: a Gerber layer, an Excellon drill file, a STEP model, a netlist, or not recognised. */
export type FileKind = 'gerber' | 'drill' | 'step' | 'netlist' | 'unknown'

export interface FileClassification extends LayerAssignment {
  kind: FileKind
}

export interface ProjectFile extends FileClassification {
  fileName: string
  content: string
}

export interface ProjectFileSummary {
  fileName: string
  kind: FileKind
}

export interface ProjectSummary {
  id: number
  name: string
  createdAt: string
  files: ProjectFileSummary[]
}

export interface Project extends ProjectSummary {
  files: ProjectFile[]
}

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
  x_size: number | null
  y_size: number | null
  side: 'top' | 'bottom'
  /** Whether the probe can be put on this pad; see main/testing/testable-pads.ts. */
  testable: boolean
  untestableReason: string | null
}

export interface GerberParseResult {
  pads: ParsedPad[]
}

/** Top and bottom views of a board as SVG markup, plus its size in the Gerber files' units. */
export interface BoardRender {
  topSvg: string
  bottomSvg: string
  units: 'mm' | 'in'
  width: number
  height: number
}

/** A pad the probe is sent to during a test run, in millimetres of the board's Gerber frame. */
export interface RunTarget {
  index: number
  x: number
  y: number
  label: string
}

/**
 * What the backend's runner reports during a test run. Positions are in the
 * board's Gerber frame in millimetres; z is the probe tip's height above the
 * board's top face. A move names its destination and how long the head took.
 */
export type LiveEvent =
  | {
      type: 'started'
      targets: number
      backend: 'ultimaker' | 'simulated'
      instrument: 'ads1115' | 'simulated'
    }
  | { type: 'move'; x: number; y: number; z: number; duration_ms: number }
  | { type: 'target'; target: RunTarget }
  | { type: 'contact'; target: RunTarget; voltage: number }
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'finished' }

/** Where the board lies on the printer bed, as the backend's runner takes it. */
export interface BoardPose {
  x: number
  y: number
  z_contact: number
  rotation_deg: number
  synced_on?: { board_xy: [number, number]; printer_xyz: [number, number, number] }
}

/** A CAD feature the localisation looked for: a mounting hole or a round pad. */
export interface LocalisedFeature {
  id: number
  kind: 'hole' | 'pad'
  board_xy: [number, number]
  image_xy: [number, number]
  inlier: boolean | null
}

/**
 * What src/main/vision/locate_pcb.py reports for one image. When the
 * board was not found, `error` says why, `fit` is null and only `detected`,
 * the circles the detector saw, is filled.
 */
export interface LocalisationResult {
  source: string
  image: { width: number; height: number }
  error: string | null
  fit: {
    detected: number
    matched: number
    inliers: number
    rms_mm: number
    outline_support: number | null
    pass: boolean
  } | null
  board_to_image: number[][] | null
  /** Every circle the detector found: x, y, radius in image pixels. */
  detected: [number, number, number][]
  features: LocalisedFeature[]
}

export interface PrinterPosition {
  x: number
  y: number
  z: number
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
  projectId: number
  event: ChatEvent
}

export interface ChatSendRequest {
  runId: string
  projectId: number
  message: string
}

export interface ChatResult {
  items: ChatTimelineItem[]
}
