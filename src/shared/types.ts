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
  /** Diameter in board millimetres. */
  dia: number
  image_xy: [number, number]
  /** The circle the detector matched to it, x, y, radius in pixels, if any. */
  detected_xyr: [number, number, number] | null
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
    outline_consistency?: number | null
    pass: boolean
    /** How many camera frames were localised and how many agree with this pose. */
    frames?: number
    agreeing?: number
  } | null
  board_to_image: number[][] | null
  /** Every circle the detector found: x, y, radius in image pixels. */
  detected: [number, number, number][]
  features: LocalisedFeature[]
  /** The sheet in this picture, when the camera is calibrated and the fit passed. */
  sheet_view?: SheetView
  /** Why there is no printer pose although the fit passed. */
  sheet_error?: string
  /** The board's pose on the printer, when the sheet is registered and seen and the fit passed. */
  pose_on_printer?: PrinterPose
}

/** What the camera and the sheet make of a localisation; the pose the runner takes. */
export interface PrinterPose {
  x: number
  y: number
  /** The bed height at which the probe touches the board, once measured on it. */
  z_contact: number | null
  rotation_deg: number
  /** Printer millimetres per board millimetre; 1 when all is well. */
  scale: number
  board_height_mm: number
  /** The height came from the board's apparent size, not from a touch. */
  height_estimated: boolean
  /** How well the board's features fit a rigid board on the printer, mm RMS. */
  residual_mm: number
  corners_seen: number
  warnings: string[]
}
export interface SheetTouch {
  target: number
  printer_xyz: [number, number, number]
}
/** The sheet-to-printer mapping from the probe's touches on the sheet's targets. */
export interface SheetRegistration {
  version: number
  registered_at: string
  sheet_to_printer: number[][]
  /** The bed height at which the tip touches the paper. */
  z_sheet: number
  z_spread: number
  /** The printout's size against its design; 1 when printed at 100 %. */
  scale: number
  mirrored: boolean
  residual_mm: number
  touches: SheetTouch[]
}
/** The camera's lens, from pictures of the sheet at several bed heights. */
export interface CameraModel {
  version: number
  calibrated_at: string
  image: { width: number; height: number }
  camera_matrix: number[][]
  distortion: number[]
  focal_px: number
  rms_px: number
  step_residual_mm: number
  pictures: { bed_z: number; corners: number; distance_mm: number }[]
}
/** One registration per tester: the camera and the sheet, each until done. */
export interface CameraRegistration {
  camera: CameraModel | null
  sheet: SheetRegistration | null
}
/** The sheet as seen in one picture and, with a camera model, the camera's pose against it. */
export interface SheetView {
  image: { width: number; height: number }
  corners: number
  /** Target number to its pixel position. */
  targets: Record<string, [number, number]>
  rvec: number[] | null
  tvec: number[] | null
  rms_px: number | null
  distance_mm: number | null
  /** The glass plate's outline in pixels. */
  outline_px: [number, number][] | null
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

/** A relative step for the jog; omitted axes stay where they are. */
export interface JogStep {
  dx?: number
  dy?: number
  dz?: number
}

/** One voltage reading where the probe stands. */
export interface VoltageReading {
  voltage: number
  unit: 'V'
}

/** The probe was put on a position, measured there and retracted. */
export interface ProbeResult {
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
  /** The camera stream the agent's take_picture tool grabs from. */
  cameraUrl: string
  /** The board's outline in mm, for finding the board in a picture. */
  outline: [number, number][]
}

export interface ChatResult {
  items: ChatTimelineItem[]
}
