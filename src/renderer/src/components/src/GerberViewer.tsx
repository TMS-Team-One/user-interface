import type { BoardBounds, ParsedPad, TestSummary } from '@shared/types'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const INITIAL_VIEW = { scale: 1, x: 0, y: 0 }
const toPercentString = (scale: number): string => String(Math.round(scale * 100))

// Radius of a pad marker, relative to the board's own viewBox size, so it
// stays a sensible size regardless of the file's units/scale.
const PAD_MARKER_RADIUS_RATIO = 0.006
const PAD_MARKER_COLOR = '#f97316'

// Places a marker for each pad directly inside the rendered SVG's own
// viewBox. `bounds` is the same file's full-geometry bounding box (traces,
// outline, everything) computed by the Python parser -- the board render
// (gerber-to-svg) sizes its viewBox to that same extent, so mapping one
// bounding box onto the other lines pads up with the artwork without either
// side needing to agree on units or on gerber-to-svg's internal scaling.
function drawPadOverlay(svgEl: SVGSVGElement, pads: ParsedPad[], bounds: BoardBounds): void {
  const viewBox = svgEl.viewBox.baseVal
  const boardWidth = bounds.x_size
  const boardHeight = bounds.y_size
  if (
    !viewBox ||
    viewBox.width <= 0 ||
    viewBox.height <= 0 ||
    boardWidth <= 0 ||
    boardHeight <= 0
  ) {
    return
  }

  const scaleX = viewBox.width / boardWidth
  const scaleY = viewBox.height / boardHeight
  const radius = Math.min(viewBox.width, viewBox.height) * PAD_MARKER_RADIUS_RATIO

  const svgNs = 'http://www.w3.org/2000/svg'
  const group = document.createElementNS(svgNs, 'g')
  group.setAttribute('data-pad-overlay', 'true')

  for (const pad of pads) {
    const cx = viewBox.x + (pad.x - bounds.min_x) * scaleX
    // SVG y grows downward while Gerber y grows upward, so flip against the
    // board's own vertical extent instead of assuming any fixed origin.
    const cy = viewBox.y + (bounds.max_y - pad.y) * scaleY

    const circle = document.createElementNS(svgNs, 'circle')
    circle.setAttribute('cx', String(cx))
    circle.setAttribute('cy', String(cy))
    circle.setAttribute('r', String(radius))
    circle.setAttribute('fill', PAD_MARKER_COLOR)
    circle.setAttribute('fill-opacity', '0.7')
    circle.setAttribute('stroke', PAD_MARKER_COLOR)
    circle.setAttribute('stroke-width', String(radius * 0.2))

    const label = pad.net_name ?? pad.aperture_function ?? 'pad'
    const title = document.createElementNS(svgNs, 'title')
    title.textContent = `${label} (${pad.x.toFixed(3)}, ${pad.y.toFixed(3)} ${pad.unit})`
    circle.appendChild(title)

    group.appendChild(circle)
  }

  svgEl.appendChild(group)
}

const GerberViewer = ({
  testCase,
  pads,
  bounds
}: {
  testCase: TestSummary
  pads: ParsedPad[] | null
  bounds: BoardBounds | null
}): React.JSX.Element => {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState(INITIAL_VIEW)
  const [zoomInput, setZoomInput] = useState(toPercentString(INITIAL_VIEW.scale))
  const containerRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  const zoomInputFocused = useRef(false)

  useEffect(() => {
    setSvg(null)
    setError(null)
    setView(INITIAL_VIEW)
    setZoomInput(toPercentString(INITIAL_VIEW.scale))
    window.api.parsing
      .renderGerberSvg(testCase.id)
      .then(setSvg)
      .catch((err) => setError(String(err)))
  }, [testCase.id])

  useEffect(() => {
    if (!containerRef.current || svg === null) return

    containerRef.current.innerHTML = svg
    const svgEl = containerRef.current.querySelector<SVGSVGElement>('svg')
    if (svgEl) {
      svgEl.removeAttribute('width')
      svgEl.removeAttribute('height')
      svgEl.style.width = '100%'
      svgEl.style.height = '100%'
      svgEl.style.display = 'block'

      if (pads && pads.length > 0 && bounds) {
        drawPadOverlay(svgEl, pads, bounds)
      }
    }
  }, [svg, pads, bounds])

  const setScale = (scale: number): void => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
    setView((prev) => ({ ...prev, scale: clamped }))
    if (!zoomInputFocused.current) setZoomInput(toPercentString(clamped))
  }

  const zoomBy = (factor: number): void => {
    setScale(view.scale * factor)
  }

  const commitZoomInput = (): void => {
    const parsed = Number(zoomInput)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setZoomInput(toPercentString(view.scale))
      return
    }
    setScale(parsed / 100)
  }

  const handleWheel = (event: React.WheelEvent): void => {
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragOrigin.current = { x: event.clientX - view.x, y: event.clientY - view.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragOrigin.current) return
    setView((prev) => ({
      ...prev,
      x: event.clientX - dragOrigin.current!.x,
      y: event.clientY - dragOrigin.current!.y
    }))
  }

  const handlePointerUp = (): void => {
    dragOrigin.current = null
  }

  const resetView = (): void => {
    setView(INITIAL_VIEW)
    setZoomInput(toPercentString(INITIAL_VIEW.scale))
  }

  if (error) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t render board</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Card className="relative flex-1 min-h-0 gap-0 overflow-hidden p-0 shadow-none">
      {svg === null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-6 text-white" />
        </div>
      )}
      <div
        className="size-full touch-none cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div
          ref={containerRef}
          className="size-full p-6 text-foreground"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: 'center'
          }}
        />
      </div>
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        <Button size="icon" variant="secondary" onClick={() => zoomBy(1 / 1.3)}>
          <Minus />
        </Button>
        <div className="flex items-center gap-1 rounded-md bg-secondary px-1.5">
          <Input
            type="number"
            min={Math.round(MIN_SCALE * 100)}
            max={Math.round(MAX_SCALE * 100)}
            value={zoomInput}
            onFocus={() => {
              zoomInputFocused.current = true
            }}
            onBlur={() => {
              zoomInputFocused.current = false
              commitZoomInput()
            }}
            onChange={(event) => setZoomInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            className="h-9 w-14 border-0 bg-transparent px-1 text-center shadow-none focus-visible:ring-0"
          />
          <span className="text-sm text-secondary-foreground">%</span>
        </div>
        <Button size="icon" variant="secondary" onClick={resetView}>
          <RotateCcw />
        </Button>
        <Button size="icon" variant="secondary" onClick={() => zoomBy(1.3)}>
          <Plus />
        </Button>
      </div>
    </Card>
  )
}

export default GerberViewer
