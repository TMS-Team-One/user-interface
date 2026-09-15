import type { TestSummary } from '@shared/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cpu, Logs } from 'lucide-react'

const TestCase = ({ testCase }: { testCase: TestSummary }): React.JSX.Element => {
  return (
    <Tabs defaultValue="circuit-board" className="flex-1">
      <TabsList>
        <TabsTrigger value="circuit-board">
          <Cpu></Cpu>Circuit Board
        </TabsTrigger>
        <TabsTrigger value="logs">
          <Logs></Logs>Logs
        </TabsTrigger>
        {/** <TabsTrigger value="chat">Chat with your PCB</TabsTrigger> **/}
      </TabsList>
      <TabsContent value="circuit-board">Circuit Board for {testCase.testName}</TabsContent>
      <TabsContent value="logs">Logs for {testCase.testName}</TabsContent>
      {/** <TabsContent value="chat">Chat with your PCB {testCase.testName}</TabsContent> **/}
    </Tabs>
  )
}

export default TestCase
