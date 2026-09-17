import type { TestSummary } from '@shared/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cpu, Logs as LogsIcon, MessageSquare } from 'lucide-react'
import CircuitBoard from './CircuitBoard'
import Logs from './Logs'
import Layout from './Layout'
import ChatPanel from './ChatPanel'

const TestCase = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  return (
    <Layout
      title={
        <span className="flex items-baseline gap-1.5 truncate">
          <span className="text-muted-foreground font-normal">Test for</span>
          <span className="truncate font-semibold">{testCase.testName}</span>
        </span>
      }
    >
      <Tabs defaultValue="circuit-board" className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="circuit-board">
            <Cpu></Cpu>Circuit Board
          </TabsTrigger>
          <TabsTrigger value="logs">
            <LogsIcon></LogsIcon>Testing
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageSquare />
            Chat
          </TabsTrigger>
        </TabsList>
        <TabsContent value="circuit-board" className="flex min-h-0 flex-1">
          <div className="w-full h-full p-2">
            <CircuitBoard testCase={testCase} />
          </div>
        </TabsContent>
        <TabsContent value="logs" className="flex min-h-0 flex-1">
          <div className="w-full h-full p-2">
            <Logs testCase={testCase} />
          </div>
        </TabsContent>
        <TabsContent value="chat" className="flex min-h-0 flex-1">
          <div className="size-full min-h-0 p-2">
            <ChatPanel key={testCase.id} testCase={testCase} />
          </div>
        </TabsContent>
      </Tabs>
    </Layout>
  )
}

export default TestCase
