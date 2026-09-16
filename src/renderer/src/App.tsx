import AppSidebar from '@/components/src/AppSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import Welcome from './components/src/Welcome'
import { useState } from 'react'
import TestCase from './components/src/TestCase'
import type { TestSummary } from '@shared/types'

function App(): React.JSX.Element {
  const [selected, setSelected] = useState<TestSummary>()
  return (
    <SidebarProvider>
      <AppSidebar
        onSelectTestCase={setSelected}
        onTestCaseDeleted={(id) =>
          setSelected((current) => (current?.id === id ? undefined : current))
        }
      />
      <SidebarInset>
        <div className="flex gap-2 p-2 flex-col flex-1">
          {selected !== undefined ? <TestCase testCase={selected} /> : <Welcome />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
