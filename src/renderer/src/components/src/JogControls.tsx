import type { PrinterPosition } from '@shared/types'
import { Minus, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/errors'

type Axis = 'x' | 'y' | 'z'
const AXES: Axis[] = ['x', 'y', 'z']
// How far one press moves the probe, chosen per axis.
const STEPS_MM = [0.1, 1, 10]

/**
 * Walks the probe in steps: a minus and a plus button per axis with the step
 * size next to them, and the position read back from the printer. The steps
 * go straight to the target, without the lift to the safe height, so the tip
 * can be set onto a sheet target or a board.
 */
export function JogControls({
  disabled = false,
  revision = 0,
  onMoved
}: {
  disabled?: boolean
  /** Bump it after the probe moved elsewhere, so the position is read again. */
  revision?: number
  onMoved?: (position: PrinterPosition) => void
}): React.JSX.Element {
  const [position, setPosition] = useState<PrinterPosition | null>(null)
  const [steps, setSteps] = useState<Record<Axis, number>>({ x: 1, y: 1, z: 1 })
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const read = async (): Promise<void> => {
    try {
      setPosition(await window.api.vision.printerPosition())
      setError(null)
    } catch (caught) {
      setPosition(null)
      setError(describeError(caught))
    }
  }

  useEffect(() => {
    if (disabled) return
    let stale = false
    window.api.vision
      .printerPosition()
      .then((at) => {
        if (!stale) setPosition(at)
      })
      .catch((caught) => {
        if (!stale) setError(describeError(caught))
      })
    return () => {
      stale = true
    }
  }, [disabled, revision])

  const jog = async (axis: Axis, sign: 1 | -1): Promise<void> => {
    setWorking(true)
    try {
      const moved = await window.api.probe.jog({ [`d${axis}`]: sign * steps[axis] })
      setPosition(moved)
      setError(null)
      onMoved?.(moved)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setWorking(false)
    }
  }

  const idle = !disabled && !working
  return (
    <div className="flex flex-col gap-1.5">
      {AXES.map((axis) => (
        <div key={axis} className="flex items-center gap-2">
          <span className="w-4 font-medium">{axis.toUpperCase()}</span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`${axis.toUpperCase()} minus`}
            disabled={!idle}
            onClick={() => jog(axis, -1)}
          >
            <Minus />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`${axis.toUpperCase()} plus`}
            disabled={!idle}
            onClick={() => jog(axis, 1)}
          >
            <Plus />
          </Button>
          {STEPS_MM.map((step) => (
            <Button
              key={step}
              type="button"
              size="xs"
              variant={steps[axis] === step ? 'default' : 'outline'}
              aria-pressed={steps[axis] === step}
              aria-label={`${step} mm per press`}
              disabled={!idle}
              onClick={() => setSteps({ ...steps, [axis]: step })}
            >
              {step}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">mm</span>
          <span className="ml-auto font-mono text-sm tabular-nums">
            {position ? position[axis].toFixed(2) : '—'}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Read position"
          disabled={!idle}
          onClick={read}
        >
          <RefreshCw />
        </Button>
        <span>{error ?? 'Steps move straight to the target, no lift to the safe height'}</span>
      </div>
    </div>
  )
}
