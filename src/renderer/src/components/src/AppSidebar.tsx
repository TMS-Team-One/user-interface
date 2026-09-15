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
import { useEffect, useState } from 'react'
import type { TestSummary } from '@shared/types'

function AddTestCaseModalContent({
  onCreated
}: {
  onCreated: (test: TestSummary) => void
}): React.JSX.Element {
  const { closeModal } = useModal()
  const [file, setFile] = useState<File | null>(null)
  const [testName, setTestName] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!file || !testName.trim()) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const gerberFileContent = await file.text()
      const test = await window.api.tests.create(testName.trim(), file.name, gerberFileContent)
      onCreated(test)
      closeModal()
    } catch (error) {
      console.error('Failed to create test case', error)
      const message = error instanceof Error ? error.message : String(error)
      setSubmitError(`Failed to add test case: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <FileUpload onFileChange={setFile} onTestNameChange={setTestName} />
      {submitError && <p className="text-xs text-destructive">{submitError}</p>}
      <DialogFooter>
        <Button disabled={!file || !testName.trim() || submitting} onClick={handleSubmit}>
          <Plus />
          {submitting ? 'Adding...' : 'Add test case'}
        </Button>
      </DialogFooter>
    </>
  )
}

function AppSidebar(): React.JSX.Element {
  const { openModal } = useModal()
  const [testCaseHistory, setTestCaseHistory] = useState<TestSummary[]>([])

  useEffect(() => {
    /** window.api.tests
      .list()
      .then(setTestCaseHistory)
      .catch((error) => console.error('Failed to load test cases', error)) **/
  }, [])

  const handleTestCaseCreated = (test: TestSummary) => {
    setTestCaseHistory((prev) => [test, ...prev])
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <h1 className="text-black text-2xl font-semibold">ProbePilot</h1>
        <Button
          className="w-full justify-start"
          onClick={() =>
            openModal({
              title: 'Add new test case',
              content: <AddTestCaseModalContent onCreated={handleTestCaseCreated} />
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
            {testCaseHistory.length === 0 || !testCaseHistory ? (
              <p className="px-2 py-1.5 text-sm text-sidebar-foreground/70">
                No test cases done yet.
              </p>
            ) : (
              <SidebarMenu>
                {testCaseHistory.map((testCase) => (
                  <SidebarMenuItem key={testCase.id}>
                    <SidebarMenuButton>{testCase.testName}</SidebarMenuButton>
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
