import { Plus, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DialogFooter } from '@/components/ui/dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { useModal } from '@/hooks/use-modal'
import { FileUpload } from './FileUpload'
import { useState } from 'react'

interface TestCase {
  id: string
  name: string
}

const testCaseHistory: TestCase[] = []

function AddTestCaseModalContent(): React.JSX.Element {
  const [fileUploaded, setFileUploaded] = useState<boolean>(false)

  return (
    <>
      <FileUpload onFileChange={(file) => setFileUploaded(!!file)} />
      <DialogFooter>
        <Button disabled={!fileUploaded}>
          <Plus />
          Add test case
        </Button>
      </DialogFooter>
    </>
  )
}

function AppSidebar(): React.JSX.Element {
  const { openModal } = useModal()

  return (
    <Sidebar>
      <SidebarHeader>
        <h1 className="text-black text-2xl font-semibold">ProbePilot</h1>
        <Button
          className="w-full justify-start"
          onClick={() =>
            openModal({
              title: 'Add new test case',
              content: <AddTestCaseModalContent />
            })
          }
        >
          <PlusIcon />
          Add new test case
        </Button>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {testCaseHistory.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-sidebar-foreground/70">
                No test cases done yet.
              </p>
            ) : (
              <SidebarMenu>
                {testCaseHistory.map((testCase) => (
                  <SidebarMenuItem key={testCase.id}>
                    <SidebarMenuButton>{testCase.name}</SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

export default AppSidebar
