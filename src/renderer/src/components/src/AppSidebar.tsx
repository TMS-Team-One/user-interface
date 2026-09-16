import { PlusIcon, RefreshCcw, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { useModal } from '@/hooks/use-modal'
import { useConnection } from '@/hooks/use-connection'
import AddTestCaseModal from './AddTestCaseModal'
import ManualControlDialog from './ManualControlDialog'
import { useEffect, useState } from 'react'
import type { TestSummary } from '@shared/types'

function AppSidebar({
  onSelectTestCase,
  onTestCaseDeleted
}: {
  onSelectTestCase: (test: TestSummary) => void
  onTestCaseDeleted?: (id: number) => void
}): React.JSX.Element {
  const { openModal } = useModal()
  const [testCaseHistory, setTestCaseHistory] = useState<TestSummary[]>([])

  useEffect(() => {
    window.api.tests
      .list()
      .then(setTestCaseHistory)
      .catch((error) => console.error('Failed to load test cases', error))
  }, [])

  const handleTestCaseCreated = (test: TestSummary): void => {
    setTestCaseHistory((prev) => [test, ...prev])
  }

  const handleDeleteTestCase = async (id: number): Promise<void> => {
    try {
      await window.api.tests.delete(id)
      setTestCaseHistory((prev) => prev.filter((testCase) => testCase.id !== id))
      onTestCaseDeleted?.(id)
    } catch (error) {
      console.error('Failed to delete test case', error)
    }
  }

  const { connectionEstablished, setConnectionEstablished, setPrinterHomed } = useConnection()
  const [checkingConnection, setCheckingConnection] = useState(false)
  const [connectionError, setConnectionError] = useState<string>()

  const handleConnectionRefresh = async (): Promise<void> => {
    setCheckingConnection(true)
    setConnectionError(undefined)
    try {
      const status = await window.api.probe.connect()
      setConnectionEstablished(status.connected)
      setPrinterHomed(status.homed)
    } catch (error) {
      setConnectionEstablished(false)
      setPrinterHomed(false)
      setConnectionError(error instanceof Error ? error.message : String(error))
    } finally {
      setCheckingConnection(false)
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="flex mt-2 mx-2">
        <h1 className="text-black text-2xl font-semibold font-sans">Probe Pilot</h1>
        <div className="w-full flex justify-center">
          <Button
            className="w-fit justify-start"
            onClick={() =>
              openModal({
                title: 'Add new test case',
                content: <AddTestCaseModal onCreated={handleTestCaseCreated} />
              })
            }
          >
            <PlusIcon />
            Add new test case
          </Button>
        </div>
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <SidebarMenuAction
                          showOnHover
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Delete ${testCase.testName}`}
                        >
                          <Trash2Icon />
                        </SidebarMenuAction>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete test case?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete &quot;{testCase.testName}&quot; and its
                            associated data. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteTestCase(testCase.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
          {checkingConnection ? (
            <div className="gap-3 flex flex-row items-center justify-center w-fit">
              <div className="rounded-4xl bg-amber-500 size-2 animate-pulse"> </div>
              <span className="text-amber-600 text-sm">Connecting…</span>
            </div>
          ) : connectionEstablished ? (
            <div className="gap-3 flex flex-row items-center justify-center w-fit">
              <div className="rounded-4xl bg-lime-600 size-2"> </div>
              <span className="text-lime-600 text-sm">Connection established</span>
            </div>
          ) : (
            <div
              className="gap-3 flex flex-row items-center justify-center w-fit"
              title={connectionError}
            >
              <div className="rounded-4xl bg-red-600 size-2"> </div>
              <span className="text-red-600 text-sm">No connection</span>
            </div>
          )}
        </div>
        <div className="flex items-center">
          <ManualControlDialog />
          <Button
            className="w-fit"
            variant={'ghost'}
            size={'icon'}
            disabled={checkingConnection}
            onClick={handleConnectionRefresh}
            aria-label="Connect to Ultimaker"
            title={connectionError || 'Connect to Ultimaker'}
          >
            <RefreshCcw className={checkingConnection ? 'animate-spin' : undefined}></RefreshCcw>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
