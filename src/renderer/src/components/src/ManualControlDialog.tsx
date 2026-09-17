import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConnection } from '@/hooks/use-connection'
import type { ManualProbeCoordinates } from '@shared/types'
import { LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'

const AXIS_LIMITS = {
  x: { minimum: 0, maximum: 223 },
  y: { minimum: 0, maximum: 223 },
  z: { minimum: 10, maximum: 205 }
} as const

function parseCoordinate(value: string, minimum: number, maximum: number): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined
}

function hardwareErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
}

function ManualControlDialog(): React.JSX.Element {
  const { connectionEstablished, setConnectionEstablished, printerHomed, setPrinterHomed } =
    useConnection()
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const [z, setZ] = useState('')
  const [operation, setOperation] = useState<'homing' | 'running'>()
  const [voltage, setVoltage] = useState<number>()
  const [error, setError] = useState<string>()

  const coordinates = useMemo<ManualProbeCoordinates | undefined>(() => {
    const parsedX = parseCoordinate(x, AXIS_LIMITS.x.minimum, AXIS_LIMITS.x.maximum)
    const parsedY = parseCoordinate(y, AXIS_LIMITS.y.minimum, AXIS_LIMITS.y.maximum)
    const parsedZ = parseCoordinate(z, AXIS_LIMITS.z.minimum, AXIS_LIMITS.z.maximum)
    if (parsedX === undefined || parsedY === undefined || parsedZ === undefined) return undefined
    return { x: parsedX, y: parsedY, z: parsedZ }
  }, [x, y, z])

  const handleHome = async (): Promise<void> => {
    setOperation('homing')
    setError(undefined)
    try {
      const status = await window.api.probe.home()
      setConnectionEstablished(status.connected)
      setPrinterHomed(status.homed)
    } catch (caughtError) {
      setPrinterHomed(false)
      setError(hardwareErrorMessage(caughtError))
    } finally {
      setOperation(undefined)
    }
  }

  const handleRun = async (): Promise<void> => {
    if (!coordinates) return
    setOperation('running')
    setError(undefined)
    setVoltage(undefined)
    try {
      const result = await window.api.probe.runManualTest(coordinates)
      setVoltage(result.voltage)
    } catch (caughtError) {
      setError(hardwareErrorMessage(caughtError))
    } finally {
      setOperation(undefined)
    }
  }

  const busy = operation !== undefined
  const canRun = connectionEstablished && printerHomed && coordinates !== undefined && !busy

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-lg"
          aria-label="Open manual controls"
          title="Manual controls"
        >
          <SlidersHorizontal />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manual control</DialogTitle>
          <DialogDescription>
            Move the probe to an absolute position, take one stable voltage measurement, and retract
            to a safe height.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ['x', x, setX],
              ['y', y, setY],
              ['z', z, setZ]
            ] as const
          ).map(([axis, value, setValue]) => {
            const limits = AXIS_LIMITS[axis]
            const invalid =
              value !== '' && parseCoordinate(value, limits.minimum, limits.maximum) === undefined
            return (
              <div className="grid gap-2" key={axis}>
                <Label htmlFor={`manual-${axis}`}>{axis.toUpperCase()} (mm)</Label>
                <Input
                  id={`manual-${axis}`}
                  type="number"
                  inputMode="decimal"
                  min={limits.minimum}
                  max={limits.maximum}
                  step="0.1"
                  value={value}
                  disabled={busy}
                  aria-invalid={invalid}
                  placeholder={`${limits.minimum}–${limits.maximum}`}
                  onChange={(event) => setValue(event.target.value)}
                />
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Limits: X 0–223 mm, Y 0–223 mm, Z 10–205 mm.
        </p>

        <div className="rounded-md border bg-muted/40 px-4 py-3" aria-live="polite">
          <p className="text-xs text-muted-foreground">Last measured voltage</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            {operation === 'running'
              ? 'Measuring…'
              : voltage === undefined
                ? '— V'
                : `${voltage.toFixed(3)} V`}
          </p>
        </div>

        {!connectionEstablished ? (
          <p className="text-sm text-amber-700">
            Connect the Ultimaker before using manual controls.
          </p>
        ) : !printerHomed ? (
          <p className="text-sm text-amber-700">
            Home the Ultimaker before entering a test position.
          </p>
        ) : null}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!connectionEstablished || busy}
            onClick={handleHome}
          >
            {operation === 'homing' && <LoaderCircle className="animate-spin" />}
            {operation === 'homing' ? 'Homing…' : printerHomed ? 'Home again' : 'Home'}
          </Button>
          <Button type="button" disabled={!canRun} onClick={handleRun}>
            {operation === 'running' && <LoaderCircle className="animate-spin" />}
            {operation === 'running' ? 'Running…' : 'Run & measure'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ManualControlDialog
