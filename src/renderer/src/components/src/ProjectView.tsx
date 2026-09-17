import type { ProjectSummary } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Box, Cpu, Logs as LogsIcon, MessageSquare, PanelRightClose, Radio } from 'lucide-react'
import { useLiveRun } from '@/hooks/use-live-run'
import { useState } from 'react'
import Board3D from './Board3D'
import ChatPanel from './ChatPanel'
import CircuitView from './CircuitView'
import Layout from './Layout'
import LiveView from './LiveView'
import Logs from './Logs'

// Every tab shows its detail view; the project's chat sits to the right of it
// and can be hidden. The test run's state lives here because tab contents
// unmount when another tab is shown.
const ProjectView = ({ project }: { project: ProjectSummary }): React.JSX.Element => {
  const run = useLiveRun()
  const [chatOpen, setChatOpen] = useState(true)
  return (
    <Layout
      title={
        <span className="flex min-w-0 items-center gap-2.5 truncate">
          <span className="rounded-md bg-muted/70 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Project
          </span>
          <span className="truncate font-semibold tracking-tight">{project.name}</span>
        </span>
      }
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-lg border border-border/70 bg-background/60 shadow-xs hover:bg-muted"
          aria-label={chatOpen ? 'Hide chat' : 'Show chat'}
          title={chatOpen ? 'Hide chat' : 'Show chat'}
          onClick={() => setChatOpen((open) => !open)}
        >
          {chatOpen ? <PanelRightClose /> : <MessageSquare />}
        </Button>
      }
    >
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={68} minSize={40}>
          <Tabs defaultValue="circuit" className="flex h-full min-h-0 flex-col">
            <TabsList className="mx-2 h-11 max-w-[calc(100%-1rem)] justify-start gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted/45 p-1 shadow-xs">
              <TabsTrigger
                value="circuit"
                className="h-8 flex-none rounded-lg px-3 text-[13px] tracking-normal hover:bg-background/60 data-[state=active]:shadow-sm data-[state=active]:[&_svg]:text-primary"
              >
                <Cpu />
                Circuit View
              </TabsTrigger>
              <TabsTrigger
                value="board-3d"
                className="h-8 flex-none rounded-lg px-3 text-[13px] tracking-normal hover:bg-background/60 data-[state=active]:shadow-sm data-[state=active]:[&_svg]:text-primary"
              >
                <Box />
                3D View
              </TabsTrigger>
              <TabsTrigger
                value="testing"
                className="h-8 flex-none rounded-lg px-3 text-[13px] tracking-normal hover:bg-background/60 data-[state=active]:shadow-sm data-[state=active]:[&_svg]:text-primary"
              >
                <LogsIcon />
                Testing
              </TabsTrigger>
              <TabsTrigger
                value="live"
                className="h-8 flex-none rounded-lg px-3 text-[13px] tracking-normal hover:bg-background/60 data-[state=active]:shadow-sm data-[state=active]:[&_svg]:text-primary"
              >
                <Radio />
                Live View
              </TabsTrigger>
            </TabsList>
            <TabsContent value="circuit" className="flex min-h-0 flex-1">
              <div className="w-full h-full p-2">
                <CircuitView key={project.id} project={project} />
              </div>
            </TabsContent>
            <TabsContent value="board-3d" className="flex min-h-0 flex-1">
              <div className="w-full h-full p-2">
                <Board3D key={project.id} project={project} run={run} />
              </div>
            </TabsContent>
            <TabsContent value="testing" className="flex min-h-0 flex-1">
              <div className="w-full h-full p-2">
                <Logs key={project.id} project={project} run={run} />
              </div>
            </TabsContent>
            <TabsContent value="live" className="flex min-h-0 flex-1">
              <div className="w-full h-full p-2">
                <LiveView key={project.id} project={project} />
              </div>
            </TabsContent>
          </Tabs>
        </ResizablePanel>
        {chatOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={32} minSize={20}>
              <div className="h-full p-2">
                <ChatPanel key={project.id} project={project} />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </Layout>
  )
}

export default ProjectView
