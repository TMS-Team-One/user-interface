import type { ProjectSummary } from '@shared/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Box, Cpu, Logs as LogsIcon, Radio } from 'lucide-react'
import { useLiveRun } from '@/hooks/use-live-run'
import Board3D from './Board3D'
import ChatPanel from './ChatPanel'
import CircuitView from './CircuitView'
import Layout from './Layout'
import LiveView from './LiveView'
import Logs from './Logs'

// Every tab shows its detail view on top and the project's chat below. The test
// run's state lives here because tab contents unmount when another tab is shown.
const ProjectView = ({ project }: { project: ProjectSummary }): React.JSX.Element => {
  const run = useLiveRun()
  return (
    <Layout
      title={
        <span className="flex items-baseline gap-1.5 truncate">
          <span className="text-muted-foreground font-normal">Project</span>
          <span className="truncate font-semibold">{project.name}</span>
        </span>
      }
    >
      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={70} minSize={30}>
          <Tabs defaultValue="circuit" className="flex h-full min-h-0 flex-col">
            <TabsList>
              <TabsTrigger value="circuit">
                <Cpu></Cpu>Circuit View
              </TabsTrigger>
              <TabsTrigger value="board-3d">
                <Box></Box>3D View
              </TabsTrigger>
              <TabsTrigger value="testing">
                <LogsIcon></LogsIcon>Testing
              </TabsTrigger>
              <TabsTrigger value="live">
                <Radio></Radio>Live View
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
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={30} minSize={15}>
          <div className="h-full p-2">
            <ChatPanel key={project.id} project={project} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </Layout>
  )
}

export default ProjectView
