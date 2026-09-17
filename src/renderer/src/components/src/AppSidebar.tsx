import { Crosshair, ListChecks, PlusIcon, RefreshCcw, Trash2Icon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

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

  const toggleSelectMode = (): void => {
    setSelectMode((prev) => !prev)
    setSelectedIds(new Set())
  }

  const toggleSelected = (id: number): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleDeleteSelected = async (): Promise<void> => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    try {
      await window.api.tests.deleteMany(ids)
      setTestCaseHistory((prev) => prev.filter((testCase) => !selectedIds.has(testCase.id)))
      ids.forEach((id) => onTestCaseDeleted?.(id))
      setSelectedIds(new Set())
      setSelectMode(false)
    } catch (error) {
      console.error('Failed to delete selected test cases', error)
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="gap-4 px-4 pb-3 pt-5">
        <div className="flex items-center gap-3 px-0.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <Crosshair className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground">
              Probe Pilot
            </h1>
            <p className="truncate text-xs text-muted-foreground">PCB test automation</p>
          </div>
        </div>

        <Button
          className="h-10 w-full justify-start rounded-xl px-3 shadow-sm"
          onClick={() =>
            openModal({
              title: 'Add new test case',
              content: <AddTestCaseModal onCreated={handleTestCaseCreated} />
            })
          }
        >
          <PlusIcon className="size-4" />
          Add new test case
        </Button>

        {testCaseHistory.length > 0 && (
          <Button
            className="h-9 w-full justify-start rounded-lg px-3 text-muted-foreground hover:text-foreground"
            variant="ghost"
            onClick={toggleSelectMode}
          >
            {selectMode ? <XIcon className="size-4" /> : <ListChecks className="size-4" />}
            {selectMode ? 'Cancel selection' : 'Select test cases'}
          </Button>
        )}
      </SidebarHeader>
      <div className="px-4 pb-2">
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
                  <SidebarMenuItem key={testCase.id} className="flex items-center gap-1">
                    {selectMode && (
                      <Checkbox
                        className="ml-2"
                        checked={selectedIds.has(testCase.id)}
                        onCheckedChange={() => toggleSelected(testCase.id)}
                        aria-label={`Select ${testCase.testName}`}
                      />
                    )}
                    <SidebarMenuButton
                      onClick={() =>
                        selectMode ? toggleSelected(testCase.id) : onSelectTestCase(testCase)
                      }
                    >
                      {testCase.testName}
                    </SidebarMenuButton>
                    {!selectMode && (
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
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {selectMode && (
        <div className="mx-3 mb-2 flex items-center justify-between">
          <span className="text-sm text-sidebar-foreground/70">{selectedIds.size} selected</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={selectedIds.size === 0}>
                <Trash2Icon />
                Delete selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedIds.size} test case(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the selected test cases and their associated data.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteSelected}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
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
