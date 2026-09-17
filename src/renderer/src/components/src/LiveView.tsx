import type { BoardPose, LocalisationResult, PrinterPosition, ProjectSummary } from '@shared/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CameraOff, Crosshair, ImageUp, Link } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useBoardRender } from '@/hooks/use-board-render'
import { outlineFromRender } from '@/lib/board-outline'
import { DEFAULT_CAMERA_URL, loadCameraUrl, saveCameraUrl } from '@/lib/camera-url'
import { playWhepStream } from '@/lib/whep'

const FRAME_JPEG_QUALITY = 0.92
// Captures the current video frame as a JPEG, the form the localisation takes.
function captureFrame(video: HTMLVideoElement): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')?.drawImage(video, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob.arrayBuffer()) : reject(new Error('No camera frame'))),
      'image/jpeg',
      FRAME_JPEG_QUALITY
    )
  })
}

// The page's content-security policy allows data: images but not blob: URLs.
function toDataUrl(jpeg: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(new Blob([jpeg], { type: 'image/jpeg' }))
  })
}

// Electron wraps errors thrown in the main process; the operator wants the cause only.
function describeError(error: unknown): string {
  return String(error).replace(/^Error: Error invoking remote method '[^']+': (Error: )?/, '')
}

function describeFit(result: LocalisationResult): string {
  const { fit } = result
  if (!fit) return `${result.error ?? 'not found'} (${result.detected.length} circles seen)`
  const rim = fit.outline_support === null ? '' : `, rim ${Math.round(fit.outline_support * 100)}%`
  const frames =
    fit.frames !== undefined && fit.frames > 1
      ? `, ${fit.agreeing} of ${fit.frames} frames agree`
      : ''
  return (
    `${fit.matched} of ${result.features.length} CAD features matched, ${fit.inliers} consistent, ` +
    `RMS ${fit.rms_mm.toFixed(3)} mm${rim}${frames}: ${fit.pass ? 'pass' : 'fail'}`
  )
}

// One click localises this many frames of the stream, this far apart, and keeps
// the pose most of them agree on.
const CONSENSUS_FRAMES = 3
const FRAME_GAP_MS = 150

async function captureFrames(video: HTMLVideoElement): Promise<ArrayBuffer[]> {
  const frames: ArrayBuffer[] = []
  for (let i = 0; i < CONSENSUS_FRAMES; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, FRAME_GAP_MS))
    frames.push(await captureFrame(video))
  }
  return frames
}

// A board point through the board-to-image homography.
function projectPoint(H: number[][], [x, y]: [number, number]): [number, number] {
  const w = H[2][0] * x + H[2][1] * y + H[2][2]
  return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]
}

// What the detector saw and what it made of it, drawn over the frame: every
// detected circle in red and, once a pose passed, matched CAD features in green,
// unseen ones in magenta and the board outline in cyan. A rejected pose is not
// drawn: it would be a different wrong guess every time.
function LocalisationOverlay({
  result,
  outline
}: {
  result: LocalisationResult
  outline: [number, number][]
}): React.JSX.Element {
  const { width, height } = result.image
  const stroke = Math.max(1, width / 640)
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 size-full"
      data-overlay="localisation"
    >
      {result.detected.map(([x, y, r], index) => (
        <circle
          key={`d${index}`}
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke="#ef4444"
          strokeWidth={stroke}
        />
      ))}
      {result.fit?.pass &&
        result.features.map((feature) => (
          <circle
            key={`f${feature.id}`}
            cx={feature.image_xy[0]}
            cy={feature.image_xy[1]}
            r={stroke * 6}
            fill="none"
            stroke={feature.inlier ? '#22c55e' : '#d946ef'}
            strokeWidth={stroke * 1.5}
          />
        ))}
      {result.fit?.pass && result.board_to_image && outline.length > 0 && (
        <polygon
          points={outline
            .map((point) => projectPoint(result.board_to_image!, point).join(','))
            .join(' ')}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={stroke}
        />
      )}
    </svg>
  )
}

function describePose(pose: BoardPose): string {
  return (
    `origin (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) mm, ` +
    `${pose.rotation_deg.toFixed(2)} deg, contact at z ${pose.z_contact.toFixed(2)} mm`
  )
}

// The camera stream, the board localisation on its frame, and the one-pad sync
// of the camera with the printer.
const LiveView = ({ project }: { project: ProjectSummary }): React.JSX.Element => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { render } = useBoardRender(project.id)
  const outline = useMemo(() => (render ? outlineFromRender(render) : []), [render])
  const [cameraUrl, setCameraUrl] = useState(loadCameraUrl)
  const [urlDraft, setUrlDraft] = useState(cameraUrl)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [located, setLocated] = useState<LocalisationResult | null>(null)
  // A photo given instead of the camera frame, shown in the camera's place.
  const [stillUrl, setStillUrl] = useState<string | null>(null)
  const [featureId, setFeatureId] = useState<number | null>(null)
  const [printer, setPrinter] = useState<PrinterPosition>({ x: 0, y: 0, z: 0 })
  const [pose, setPose] = useState<BoardPose | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!videoRef.current) return
    let stale = false
    let stop: (() => void) | null = null
    setCameraError(null)
    playWhepStream(cameraUrl, videoRef.current, window.api.live.whep)
      .then((stopStream) => {
        if (stale) stopStream()
        else stop = stopStream
      })
      .catch((err) => {
        if (!stale) setCameraError(`No stream from ${cameraUrl}: ${describeError(err)}`)
      })
    return () => {
      stale = true
      stop?.()
    }
  }, [cameraUrl])

  const connectCamera = (): void => {
    const url = urlDraft.trim()
    if (!url) return
    saveCameraUrl(url)
    setCameraUrl(url)
  }

  useEffect(() => {
    let stale = false
    window.api.projects.getPose(project.id).then((saved) => {
      if (!stale) setPose(saved)
    })
    window.api.vision.lastLocalisation(project.id).then((last) => {
      if (!stale && last) setLocated(last)
    })
    return () => {
      stale = true
    }
  }, [project.id])

  const locate = async (frames: Promise<ArrayBuffer[]>, fromFile: boolean): Promise<void> => {
    setBusy('Locating the board...')
    setMessage(null)
    try {
      const bytes = await frames
      const { result } = await window.api.vision.locateBoard(project.id, bytes, outline)
      setLocated(result)
      setStillUrl(fromFile ? await toDataUrl(bytes[0]) : null)
      setFeatureId(result.features.find((feature) => feature.inlier)?.id ?? null)
      setMessage(describeFit(result))
    } catch (error) {
      setMessage(describeError(error))
    } finally {
      setBusy(null)
    }
  }

  const readPrinter = async (): Promise<void> => {
    setBusy('Reading the printer position...')
    try {
      setPrinter(await window.api.vision.printerPosition())
      setMessage(null)
    } catch (error) {
      setMessage(describeError(error))
    } finally {
      setBusy(null)
    }
  }

  const sync = async (): Promise<void> => {
    if (featureId === null) return
    setBusy('Syncing...')
    try {
      const synced = await window.api.vision.syncPose(project.id, featureId, printer)
      setPose(synced)
      setMessage(`Synced: ${describePose(synced)}`)
    } catch (error) {
      setMessage(describeError(error))
    } finally {
      setBusy(null)
    }
  }

  const inliers = located?.features.filter((feature) => feature.inlier) ?? []

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Card className="relative flex-1 min-h-0 gap-0 overflow-hidden bg-black p-0 shadow-none">
        {cameraError && !stillUrl && (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CameraOff />
              </EmptyMedia>
              <EmptyTitle>Camera not available</EmptyTitle>
              <EmptyDescription>{cameraError}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {stillUrl && (
          <img src={stillUrl} alt="Photo of the board" className="size-full object-contain" />
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cameraError || stillUrl ? 'hidden' : 'size-full object-contain'}
        />
        {located && !(cameraError && !stillUrl) && (
          <LocalisationOverlay result={located} outline={outline} />
        )}
      </Card>
      <form
        className="flex shrink-0 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          connectCamera()
        }}
      >
        <Label htmlFor="camera-url" className="shrink-0">
          Camera stream
        </Label>
        <Input
          id="camera-url"
          className="h-8"
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
          placeholder={DEFAULT_CAMERA_URL}
        />
        <Button type="submit" size="sm" variant="secondary">
          Connect
        </Button>
      </form>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy !== null || cameraError !== null}
          onClick={() => videoRef.current && locate(captureFrames(videoRef.current), false)}
        >
          <Crosshair></Crosshair>Locate board
        </Button>
        <Label className="cursor-pointer">
          <Button size="sm" variant="secondary" asChild disabled={busy !== null}>
            <span>
              <ImageUp></ImageUp>Locate from image
            </span>
          </Button>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file)
                locate(
                  file.arrayBuffer().then((bytes) => [bytes]),
                  true
                )
              event.target.value = ''
            }}
          />
        </Label>
        {located && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLocated(null)
              setStillUrl(null)
            }}
          >
            Clear
          </Button>
        )}
        <span className="text-sm text-muted-foreground">{busy ?? message}</span>
      </div>
      {located?.fit?.pass && (
        <div className="flex shrink-0 flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="sync-feature">Probe stands on</Label>
            <NativeSelect
              id="sync-feature"
              size="sm"
              value={featureId ?? ''}
              onChange={(event) => setFeatureId(Number(event.target.value))}
            >
              {inliers.map((feature) => (
                <NativeSelectOption key={feature.id} value={feature.id}>
                  {feature.kind} {feature.id} at ({feature.board_xy[0].toFixed(2)},{' '}
                  {feature.board_xy[1].toFixed(2)}) mm
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="grid gap-1">
              <Label htmlFor={`printer-${axis}`}>Printer {axis.toUpperCase()}</Label>
              <Input
                id={`printer-${axis}`}
                type="number"
                step="0.01"
                className="h-8 w-24"
                value={printer[axis]}
                onChange={(event) => setPrinter({ ...printer, [axis]: Number(event.target.value) })}
              />
            </div>
          ))}
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={readPrinter}>
            Read from printer
          </Button>
          <Button size="sm" disabled={busy !== null || featureId === null} onClick={sync}>
            <Link></Link>Sync camera and printer
          </Button>
        </div>
      )}
      <p className="shrink-0 text-sm text-muted-foreground">
        {pose
          ? `Board pose: ${describePose(pose)}`
          : 'Board pose: not synced yet, runs use the default pose.'}
      </p>
    </div>
  )
}

export default LiveView
