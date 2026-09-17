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
import type { ManualProbeCoordinates, SheetRegistration, SheetTouch } from '@shared/types'
import { LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { JogControls } from './JogControls'

const TARGETS = [1, 2, 3, 4]
const MIN_TOUCHES = 3

const AXIS_LIMITS = {
  x: { minimum: 0, maximum: 223 },
  y: { minimum: 0, maximum: 223 },
  z: { minimum: 0, maximum: 205 }
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

const formatXyz = ([x, y, z]: [number, number, number]): string =>
  `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`

// The probe's position on each of the sheet's numbered target corners, taken
// with the tip on it, and the registration made from three or four of them.
function SheetTargets({
  touches,
  setTouches,
  disabled
}: {
  touches: Record<number, SheetTouch>
  setTouches: React.Dispatch<React.SetStateAction<Record<number, SheetTouch>>>
  disabled: boolean
}): React.JSX.Element {
  const [registration, setRegistration] = useState<SheetRegistration | null>(null)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string>()
  const touched = Object.keys(touches).length

  useEffect(() => {
    window.api.vision
      .registration()
      .then((saved) => setRegistration(saved.sheet))
      .catch(() => setRegistration(null))
  }, [])

  const act = async (action: () => Promise<string>): Promise<void> => {
    setWorking(true)
    try {
      setMessage(await action())
    } catch (caughtError) {
      setMessage(hardwareErrorMessage(caughtError))
    } finally {
      setWorking(false)
    }
  }

  const takePosition = (target: number): Promise<void> =>
    act(async () => {
      const { x, y, z } = await window.api.vision.printerPosition()
      setTouches((current) => ({ ...current, [target]: { target, printer_xyz: [x, y, z] } }))
      return `Target ${target} taken at ${formatXyz([x, y, z])}`
    })

  const register = (): Promise<void> =>
    act(async () => {
      const saved = await window.api.vision.registerSheet(Object.values(touches))
      setRegistration(saved.sheet)
      const sheet = saved.sheet!
      return (
        `Sheet registered: residual ${sheet.residual_mm.toFixed(2)} mm, printout at ` +
        `${(sheet.scale * 100).toFixed(1)} %, paper touched at Z ${sheet.z_sheet.toFixed(2)} mm`
      )
    })

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Sheet targets</p>
      <p className="text-xs text-muted-foreground">
        Jog the tip onto a numbered corner of the bed sheet, touching the paper, and take its
        position. Three targets register the sheet, a fourth checks it.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {TARGETS.map((target) => (
          <div key={target} className="grid gap-1">
            <Button
              type="button"
              size="sm"
              variant={touches[target] ? 'default' : 'outline'}
              disabled={disabled || working}
              onClick={() => takePosition(target)}
            >
              Take position {target}
            </Button>
            <span className="text-center text-xs text-muted-foreground">
              {touches[target] ? formatXyz(touches[target].printer_xyz) : 'not taken'}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || working || touched < MIN_TOUCHES}
          onClick={register}
        >
          Register sheet ({touched} of {MIN_TOUCHES})
        </Button>
        <span className="text-xs text-muted-foreground">
          {registration
            ? `Registered ${registration.registered_at}: residual ${registration.residual_mm.toFixed(2)} mm, ` +
              `paper at Z ${registration.z_sheet.toFixed(2)} mm`
            : 'Not registered yet'}
        </span>
      </div>
      {message && <p className="text-xs">{message}</p>}
    </div>
  )
}

function ManualControlDialog(): React.JSX.Element {
  const { connectionEstablished, setConnectionEstablished, printerHomed, setPrinterHomed } =
    useConnection()
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const [z, setZ] = useState('')
  const [operation, setOperation] = useState<'homing' | 'moving' | 'measuring'>()
  const [voltage, setVoltage] = useState<number>()
  const [error, setError] = useState<string>()
  // Kept while the dialog is closed, so the targets can be taken one at a time.
  const [touches, setTouches] = useState<Record<number, SheetTouch>>({})
  // Counts the moves made from here, so the jog rows read the position again.
  const [moves, setMoves] = useState(0)

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
      setMoves((count) => count + 1)
    } catch (caughtError) {
      setPrinterHomed(false)
      setError(hardwareErrorMessage(caughtError))
    } finally {
      setOperation(undefined)
    }
  }

  const handleMove = async (): Promise<void> => {
    if (!coordinates) return
    setOperation('moving')
    setError(undefined)
    try {
      await window.api.probe.move(coordinates)
      setMoves((count) => count + 1)
    } catch (caughtError) {
      setError(hardwareErrorMessage(caughtError))
    } finally {
      setOperation(undefined)
    }
  }

  const handleMeasure = async (): Promise<void> => {
    setOperation('measuring')
    setError(undefined)
    setVoltage(undefined)
    try {
      const reading = await window.api.probe.measure()
      setVoltage(reading.voltage)
    } catch (caughtError) {
      setError(hardwareErrorMessage(caughtError))
    } finally {
      setOperation(undefined)
    }
  }

  const busy = operation !== undefined
  const canMove = connectionEstablished && printerHomed && coordinates !== undefined && !busy
  const canMeasure = connectionEstablished && !busy

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manual control</DialogTitle>
          <DialogDescription>
            Move the probe to an absolute position or jog it in steps, measure the voltage where it
            stands, and register the bed sheet with the tip on its targets.
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

        <p className="text-xs text-muted-foreground">Limits: X 0–223 mm, Y 0–223 mm, Z 0–205 mm.</p>

        <div className="grid gap-2">
          <p className="text-sm font-medium">Jog</p>
          <JogControls
            disabled={!connectionEstablished || !printerHomed || busy}
            revision={moves}
          />
        </div>

        <SheetTargets
          touches={touches}
          setTouches={setTouches}
          disabled={!connectionEstablished || !printerHomed || busy}
        />

        <div className="rounded-md border bg-muted/40 px-4 py-3" aria-live="polite">
          <p className="text-xs text-muted-foreground">Last measured voltage</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            {operation === 'measuring'
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
          <p className="text-sm text-amber-700">Home the Ultimaker before moving it.</p>
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
          <Button type="button" variant="outline" disabled={!canMove} onClick={handleMove}>
            {operation === 'moving' && <LoaderCircle className="animate-spin" />}
            {operation === 'moving' ? 'Moving…' : 'Move'}
          </Button>
          <Button type="button" disabled={!canMeasure} onClick={handleMeasure}>
            {operation === 'measuring' && <LoaderCircle className="animate-spin" />}
            {operation === 'measuring' ? 'Measuring…' : 'Measure'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ManualControlDialog
