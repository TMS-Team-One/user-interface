import {
  CircuitBoard as CircuitBoardIcon,
  Crosshair,
  ListChecks,
  PlusIcon,
  Printer,
  RefreshCcw,
  Trash2Icon,
  XIcon
} from 'lucide-react'
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
          className="h-10 w-full justify-start px-3 shadow-sm"
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
      </SidebarHeader>
      <div className="px-4 pb-2">
        <Separator />
      </div>
      <SidebarContent className="px-2 pb-2">
        <SidebarGroup className="p-0">
          <div className="flex h-9 items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                Test cases
              </span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
                {testCaseHistory.length}
              </span>
            </div>
            {testCaseHistory.length > 0 && (
              <Button
                className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                variant="ghost"
                onClick={toggleSelectMode}
              >
                {selectMode ? <XIcon className="size-3.5" /> : <ListChecks className="size-3.5" />}
                {selectMode ? 'Cancel' : 'Select'}
              </Button>
            )}
          </div>
          <SidebarGroupContent>
            {testCaseHistory.length === 0 || !testCaseHistory ? (
              <div className="mx-1 mt-1 flex flex-col items-center rounded-xl border border-dashed border-sidebar-border bg-sidebar-accent/30 px-4 py-8 text-center">
                <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CircuitBoardIcon className="size-4" />
                </div>
                <p className="text-sm font-medium text-foreground">No test cases yet</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Add a Gerber file to start testing a board.
                </p>
              </div>
            ) : (
              <SidebarMenu className="gap-1.5">
                {testCaseHistory.map((testCase) => (
                  <SidebarMenuItem key={testCase.id} className="flex items-center gap-1 rounded-xl">
                    {selectMode && (
                      <Checkbox
                        className="ml-2 border-primary/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                        checked={selectedIds.has(testCase.id)}
                        onCheckedChange={() => toggleSelected(testCase.id)}
                        aria-label={`Select ${testCase.testName}`}
                      />
                    )}
                    <SidebarMenuButton
                      className="h-10 rounded-xl px-3 hover:bg-sidebar-accent"
                      onClick={() =>
                        selectMode ? toggleSelected(testCase.id) : onSelectTestCase(testCase)
                      }
                    >
                      {!selectMode && <CircuitBoardIcon className="text-primary" />}
                      <span>{testCase.testName}</span>
                    </SidebarMenuButton>
                    {!selectMode && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <SidebarMenuAction
                            showOnHover
                            className="right-2 top-2.5 size-6 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
        <div className="mx-3 mb-3 flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2.5 ring-1 ring-primary/15">
          <span className="text-xs font-medium text-primary">{selectedIds.size} selected</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="rounded-lg"
                variant="destructive"
                size="sm"
                disabled={selectedIds.size === 0}
              >
                <Trash2Icon />
                Delete
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
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-sidebar-accent/50 p-2.5 ring-1 ring-sidebar-border">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-xs">
            <Printer className="size-4" />
          </div>
          <div className="min-w-0 flex-1" title={connectionError}>
            <p className="truncate text-xs font-medium text-foreground">Ultimaker 2+</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  checkingConnection
                    ? 'animate-pulse bg-amber-500'
                    : connectionEstablished
                      ? 'bg-primary'
                      : 'bg-muted-foreground/50'
                }`}
              />
              <span className="truncate text-[11px] text-muted-foreground">
                {checkingConnection
                  ? 'Connecting…'
                  : connectionEstablished
                    ? 'Connected'
                    : 'Not connected'}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 [&_button]:rounded-lg">
            <ManualControlDialog />
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={checkingConnection}
              onClick={handleConnectionRefresh}
              aria-label="Connect to Ultimaker"
              title={connectionError || 'Connect to Ultimaker'}
            >
              <RefreshCcw className={checkingConnection ? 'animate-spin' : undefined} />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
