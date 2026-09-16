import type { TestSummary } from '@shared/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cpu, Logs as LogsIcon } from 'lucide-react'
import CircuitBoard from './CircuitBoard'
import Logs from './Logs'
import Layout from './Layout'
import { Button } from '../ui/button'

const TestCase = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  return (
    <Layout title={`Test for "${testCase.testName}"`} action={<Button>Run test</Button>}>
      <Tabs defaultValue="circuit-board" className="flex-1">
        <TabsList>
          <TabsTrigger value="circuit-board">
            <Cpu></Cpu>Circuit Board
          </TabsTrigger>
          <TabsTrigger value="logs">
            <LogsIcon></LogsIcon>Logs
          </TabsTrigger>
          {/** <TabsTrigger value="chat">Chat with your PCB</TabsTrigger> **/}
        </TabsList>
        <TabsContent value="circuit-board" className="flex flex-1">
          <CircuitBoard testCase={testCase} />
        </TabsContent>
        <TabsContent value="logs" className="flex flex-1">
          <Logs testCase={testCase} />
        </TabsContent>
        {/** <TabsContent value="chat">Chat with your PCB {testCase.testName}</TabsContent> **/}
      </Tabs>
    </Layout>
  )
}

export default TestCase
