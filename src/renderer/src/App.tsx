import AppSidebar from '@/components/src/AppSidebar'
import Welcome from '@/components/src/Welcome'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from './components/ui/separator'

function App(): React.JSX.Element {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex gap-2 p-2 flex-col flex-1">
          <SidebarTrigger />
          <Separator></Separator>
          <Welcome />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
