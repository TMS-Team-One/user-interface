import type { BoardRender, ParsedPad, ProjectSummary } from '@shared/types'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useBoardRender } from '@/hooks/use-board-render'

type Side = ParsedPad['side']

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const INITIAL_VIEW = { scale: 1, x: 0, y: 0 }
const toPercentString = (scale: number): string => String(Math.round(scale * 100))

// Radius of a pad marker, relative to the board's own viewBox size, so it
// stays a sensible size regardless of the file's units/scale.
const PAD_MARKER_RADIUS_RATIO = 0.006
const TESTABLE_PAD_COLOR = '#22c55e'
const UNTESTABLE_PAD_COLOR = '#9ca3af'

// Places a marker for each pad directly inside the rendered SVG. pcb-stackup
// draws the board in the Gerber files' units x 1000, flips the y axis so the
// board appears the right way up, and mirrors the bottom view as if the board
// were turned over. The markers go into a group carrying those same
// transforms, so the parser's coordinates (always inches) land on the artwork
// without either side having to agree on a bounding box.
function drawPadOverlay(
  svgEl: SVGSVGElement,
  pads: ParsedPad[],
  units: BoardRender['units'],
  side: Side
): void {
  const viewBox = svgEl.viewBox.baseVal
  if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) {
    return
  }

  const scale = (units === 'mm' ? 25.4 : 1) * 1000
  const radius = Math.min(viewBox.width, viewBox.height) * PAD_MARKER_RADIUS_RATIO
  const flip = `translate(0, ${2 * viewBox.y + viewBox.height}) scale(1, -1)`
  const mirror = `translate(${2 * viewBox.x + viewBox.width}, 0) scale(-1, 1)`

  const svgNs = 'http://www.w3.org/2000/svg'
  const group = document.createElementNS(svgNs, 'g')
  group.setAttribute('data-pad-overlay', 'true')
  group.setAttribute('transform', side === 'bottom' ? `${flip} ${mirror}` : flip)

  for (const pad of pads) {
    const circle = document.createElementNS(svgNs, 'circle')
    circle.setAttribute('cx', String(pad.x * scale))
    circle.setAttribute('cy', String(pad.y * scale))
    circle.setAttribute('r', String(radius))
    const color = pad.testable ? TESTABLE_PAD_COLOR : UNTESTABLE_PAD_COLOR
    circle.setAttribute('fill', color)
    circle.setAttribute('fill-opacity', '0.7')
    circle.setAttribute('stroke', color)
    circle.setAttribute('stroke-width', String(radius * 0.2))

    const label = pad.net_name ?? pad.aperture_function ?? 'pad'
    const title = document.createElementNS(svgNs, 'title')
    title.textContent =
      `${label} (${pad.x.toFixed(3)}, ${pad.y.toFixed(3)} ${pad.unit})` +
      (pad.untestableReason ? ` - not testable: ${pad.untestableReason}` : ' - testable')
    circle.appendChild(title)

    group.appendChild(circle)
  }

  svgEl.appendChild(group)
}

const GerberViewer = ({
  project,
  pads
}: {
  project: ProjectSummary
  pads: ParsedPad[] | null
}): React.JSX.Element => {
  const { render, error } = useBoardRender(project.id)
  const [side, setSide] = useState<Side>('top')
  const [view, setView] = useState(INITIAL_VIEW)
  const [zoomInput, setZoomInput] = useState(toPercentString(INITIAL_VIEW.scale))
  const containerRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  const zoomInputFocused = useRef(false)

  useEffect(() => {
    if (!containerRef.current || render === null) return

    containerRef.current.innerHTML = side === 'top' ? render.topSvg : render.bottomSvg
    const svgEl = containerRef.current.querySelector<SVGSVGElement>('svg')
    if (svgEl) {
      svgEl.removeAttribute('width')
      svgEl.removeAttribute('height')
      svgEl.style.width = '100%'
      svgEl.style.height = '100%'
      svgEl.style.display = 'block'

      if (pads) {
        drawPadOverlay(
          svgEl,
          pads.filter((pad) => pad.side === side),
          render.units,
          side
        )
      }
    }
  }, [render, pads, side])

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
    // Read the origin now: the updater runs later, possibly after the pointer was released.
    const origin = dragOrigin.current
    if (!origin) return
    setView((prev) => ({
      ...prev,
      x: event.clientX - origin.x,
      y: event.clientY - origin.y
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
      {render === null && (
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
      <div className="absolute bottom-2 left-2 flex items-center gap-1">
        <Button
          size="sm"
          variant={side === 'top' ? 'default' : 'secondary'}
          onClick={() => setSide('top')}
        >
          Top
        </Button>
        <Button
          size="sm"
          variant={side === 'bottom' ? 'default' : 'secondary'}
          onClick={() => setSide('bottom')}
        >
          Bottom
        </Button>
        {render && (
          <span className="ml-2 text-sm text-muted-foreground">
            {render.width.toFixed(2)} x {render.height.toFixed(2)} {render.units}
          </span>
        )}
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
