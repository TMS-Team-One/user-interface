import { Plus, PlusIcon, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DialogFooter } from '@/components/ui/dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

function AppSidebar({
  onSelectTestCase
}: {
  onSelectTestCase: (test: TestSummary) => void
}): React.JSX.Element {
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

  const [connectionEstablished, setConnectionEstablished] = useState<boolean>(true)

  return (
    <Sidebar>
      <SidebarHeader className="flex mt-2 mx-2">
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
      <div className="p-2">
        <Separator />
      </div>
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
                    <SidebarMenuButton onClick={() => onSelectTestCase(testCase)}>
                      {testCase.testName}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <div className="p-1">
        <Separator />
      </div>
      <SidebarFooter className="mx-3 mb-1 flex flex-row items-center justify-between">
        <div>
          {connectionEstablished ? (
            <div className="gap-3 flex flex-row items-center justify-center w-fit">
              <div className="rounded-4xl bg-lime-600 size-2"> </div>
              <a className="text-lime-600 text-sm">Connection established</a>
            </div>
          ) : (
            <div className="gap-3 flex flex-row items-center justify-center w-fit">
              <div className="rounded-4xl bg-red-600 size-2"> </div>
              <a className="text-red-600 text-sm">No connection</a>
            </div>
          )}
        </div>
        <Button className="w-fit" variant={'ghost'} size={'icon'}>
          <RefreshCcw></RefreshCcw>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
