import type { ProjectSummary } from '@shared/types'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useBoardRender } from '@/hooks/use-board-render'
import type { LiveRun } from '@/hooks/use-live-run'
import { useProjectModel } from '@/hooks/use-project-model'
import { mountBoardScene, type BoardScene } from '@/lib/board-scene'

const Board3D = ({
  project,
  run
}: {
  project: ProjectSummary
  run: LiveRun
}): React.JSX.Element => {
  const { render, error } = useBoardRender(project.id)
  const model = useProjectModel(project.id)
  const lastContact = run.contacts[run.contacts.length - 1]
  const [showProbe, setShowProbe] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BoardScene | null>(null)

  useEffect(() => {
    if (!containerRef.current || render === null || model === undefined) return
    const scene = mountBoardScene(containerRef.current, render, model)
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [render, model])

  // These run after the scene effect, so a freshly mounted scene picks the state up as well.
  useEffect(() => {
    sceneRef.current?.setProbeVisible(showProbe)
  }, [showProbe, render, model])

  useEffect(() => {
    const move = run.move
    sceneRef.current?.moveProbeTo(
      move ? { x: move.x, y: move.y, z: move.z } : null,
      move?.duration_ms ?? 600
    )
  }, [run.move, render, model])

  useEffect(() => {
    sceneRef.current?.setTarget(run.target ? { x: run.target.x, y: run.target.y } : null)
  }, [run.target, render, model])

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
      {(render === null || model === undefined) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-6" />
        </div>
      )}
      <div ref={containerRef} className="size-full" />
      {run.running && lastContact && (
        <div
          key={run.contacts.length}
          className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 animate-in fade-in zoom-in-75 duration-300 rounded-full border bg-background/90 px-3 py-1 text-sm shadow-sm"
        >
          {lastContact.target.label}: {lastContact.voltage.toFixed(2)} V
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-3 text-sm text-muted-foreground">
        Drag to turn, scroll to zoom, right-drag to move
      </p>
      <div className="absolute bottom-2 right-3 flex items-center gap-2">
        <Switch id="show-probe" checked={showProbe} onCheckedChange={setShowProbe} />
        <Label htmlFor="show-probe">Probe</Label>
      </div>
    </Card>
  )
}

export default Board3D
