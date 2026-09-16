import type { TestSummary } from '@shared/types'
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

const GerberViewerContent = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState(INITIAL_VIEW)
  const [zoomInput, setZoomInput] = useState(toPercentString(INITIAL_VIEW.scale))
  const containerRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  const zoomInputFocused = useRef(false)

  useEffect(() => {
    let cancelled = false

    window.api.parsing
      .renderGerberSvg(testCase.id)
      .then((renderedSvg) => {
        if (!cancelled) setSvg(renderedSvg)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })

    return () => {
      cancelled = true
    }
  }, [testCase.id])

  useEffect(() => {
    if (!containerRef.current || svg === null) return

    containerRef.current.innerHTML = svg
    const svgEl = containerRef.current.querySelector('svg')
    if (svgEl) {
      svgEl.removeAttribute('width')
      svgEl.removeAttribute('height')
      svgEl.style.width = '100%'
      svgEl.style.height = '100%'
      svgEl.style.display = 'block'
    }
  }, [svg])

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

const GerberViewer = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => (
  <GerberViewerContent key={testCase.id} testCase={testCase} />
)

export default GerberViewer
