import type { BoardPose, GerberParseResult, ParsedPad, ProjectSummary } from '@shared/types'
import { boardToPrinter, padMm } from '@shared/board-pose'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/errors'
import GerberViewer from './GerberViewer'

// "Move above pad" parks the tip this far above the contact height.
const HOVER_ABOVE_CONTACT_MM = 10

function describePad(pad: ParsedPad): string {
  const [x, y] = padMm(pad)
  const name = pad.net_name ?? pad.aperture_function ?? 'pad'
  return `${name} at (${x.toFixed(2)}, ${y.toFixed(2)}) mm, ${pad.side} side`
}

const CircuitView = ({ project }: { project: ProjectSummary }): React.JSX.Element => {
  const [result, setResult] = useState<GerberParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ParsedPad | null>(null)
  const [pose, setPose] = useState<BoardPose | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // Pad parsing takes seconds; a previous project's pads must not land on this one.
    let stale = false
    window.api.parsing
      .parsePads(project.id)
      .then((parsed) => {
        if (stale) return
        setResult(parsed)
        setSelected(null)
      })
      .catch((err) => {
        if (!stale) setError(String(err))
      })
    // The pose comes from the Live View; this tab is mounted afresh each time it opens.
    window.api.projects.getPose(project.id).then((saved) => {
      if (!stale) setPose(saved)
    })
    return () => {
      stale = true
    }
  }, [project.id])

  const printerXy = selected && pose ? boardToPrinter(pose, padMm(selected)) : null

  const run = async (what: string, action: () => Promise<string>): Promise<void> => {
    setBusy(true)
    setMessage(`${what}...`)
    try {
      setMessage(await action())
    } catch (caught) {
      setMessage(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  const moveAbove = (): Promise<void> =>
    run('Moving above the pad', async () => {
      if (!printerXy || !pose) throw new Error('No pose')
      const at = await window.api.probe.move({
        x: printerXy[0],
        y: printerXy[1],
        z: pose.z_contact + HOVER_ABOVE_CONTACT_MM
      })
      return `Probe ${HOVER_ABOVE_CONTACT_MM} mm above the pad at ${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)}`
    })

  const probe = (): Promise<void> =>
    run('Probing the pad', async () => {
      if (!printerXy || !pose) throw new Error('No pose')
      const reading = await window.api.probe.probeAt({
        x: printerXy[0],
        y: printerXy[1],
        z: pose.z_contact
      })
      return `${reading.voltage.toFixed(3)} V on the pad; probe retracted`
    })

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <GerberViewer
        project={project}
        pads={result?.pads ?? null}
        selectedPad={selected}
        onPadClick={setSelected}
      />
      <div className="max-h-48 shrink-0 overflow-auto">
        {error && <pre className="text-destructive">{error}</pre>}
        {result && (
          <p className="text-sm text-muted-foreground">
            {result.pads.filter((pad) => pad.testable).length} testable pads of{' '}
            {result.pads.filter((pad) => pad.side === 'top').length} on the top side, green in the
            view; hover a marker for the reason, click one to move the probe to it.
          </p>
        )}
        {selected && (
          <div className="flex flex-wrap items-center gap-2 py-1 text-sm">
            <span>
              {describePad(selected)}
              {printerXy && pose
                ? `; on the printer at (${printerXy[0].toFixed(2)}, ${printerXy[1].toFixed(2)}), contact at Z ${pose.z_contact.toFixed(2)} mm`
                : '; locate the board and capture its contact in the Live View to move there'}
            </span>
            <Button size="sm" variant="outline" disabled={!printerXy || busy} onClick={moveAbove}>
              Move above pad
            </Button>
            <Button
              size="sm"
              disabled={!printerXy || busy || !selected.testable}
              title={selected.testable ? undefined : `Not testable: ${selected.untestableReason}`}
              onClick={probe}
            >
              Probe pad
            </Button>
            {message && <span className="text-muted-foreground">{message}</span>}
          </div>
        )}
        {result && <pre>{JSON.stringify(result.pads, null, 2)}</pre>}
      </div>
    </div>
  )
}

export default CircuitView
