import AppSidebar from '@/components/src/AppSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import Welcome from './components/src/Welcome'
import { useState } from 'react'
import ProjectView from './components/src/ProjectView'
import type { ProjectSummary } from '@shared/types'

function App(): React.JSX.Element {
  const [selected, setSelected] = useState<ProjectSummary>()
  return (
    <SidebarProvider>
      <AppSidebar
        onSelectProject={setSelected}
        onProjectDeleted={(id) =>
          setSelected((current) => (current?.id === id ? undefined : current))
        }
      />
      <SidebarInset>
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          {selected !== undefined ? <ProjectView project={selected} /> : <Welcome />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
