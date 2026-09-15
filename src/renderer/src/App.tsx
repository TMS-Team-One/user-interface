import AppSidebar from '@/components/src/AppSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import Layout from './components/src/Layout'
import Welcome from './components/src/Welcome'
import { useState } from 'react'
import TestCase from './components/src/TestCase'
import type { TestSummary } from '@shared/types'

function App(): React.JSX.Element {
  const [selected, setSelected] = useState<TestSummary>()
  return (
    <SidebarProvider>
      <AppSidebar onSelectTestCase={setSelected} />
      <SidebarInset>
        <div className="flex gap-2 p-2 flex-col flex-1">
          <Layout title={!selected ? '' : `Test for "${selected.testName}"`}>
            {selected !== undefined ? <TestCase testCase={selected} /> : <Welcome />}
          </Layout>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
