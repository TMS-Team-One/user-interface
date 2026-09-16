import type { TestSummary } from '@shared/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cpu, Logs as LogsIcon } from 'lucide-react'
import CircuitBoard from './CircuitBoard'
import Logs from './Logs'
import Layout from './Layout'

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
      <Tabs defaultValue="circuit-board" className="flex-1">
        <TabsList>
          <TabsTrigger value="circuit-board">
            <Cpu></Cpu>Circuit Board
          </TabsTrigger>
          <TabsTrigger value="logs">
            <LogsIcon></LogsIcon>Testing
          </TabsTrigger>
          {/** <TabsTrigger value="chat">Chat with your PCB</TabsTrigger> **/}
        </TabsList>
        <TabsContent value="circuit-board" className="flex flex-1">
          <div className="w-full h-full p-2">
            <CircuitBoard testCase={testCase} />
          </div>
        </TabsContent>
        <TabsContent value="logs" className="flex flex-1">
          <div className="w-full h-full p-2">
            <Logs testCase={testCase} />
          </div>
        </TabsContent>
        {/** <TabsContent value="chat">Chat with your PCB {testCase.testName}</TabsContent> **/}
      </Tabs>
    </Layout>
  )
}

export default TestCase
