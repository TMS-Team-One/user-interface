import {
  ChevronRight,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem
} from '@/components/ui/sidebar'
import { useModal } from '@/hooks/use-modal'
import { useConnection } from '@/hooks/use-connection'
import NewProjectModal from './NewProjectModal'
import ManualControlDialog from './ManualControlDialog'
import { useEffect, useState } from 'react'
import type { FileKind, ProjectSummary } from '@shared/types'

const FILE_KIND_LABELS: Record<FileKind, string> = {
  gerber: 'Gerber',
  drill: 'Drill',
  step: 'STEP',
  netlist: 'Netlist',
  unknown: 'Not used'
}

function AppSidebar({
  onSelectProject,
  onProjectDeleted
}: {
  onSelectProject: (project: ProjectSummary) => void
  onProjectDeleted?: (id: number) => void
}): React.JSX.Element {
  const { openModal } = useModal()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    window.api.projects
      .list()
      .then(setProjects)
      .catch((error) => console.error('Failed to load projects', error))
  }, [])

  const handleProjectCreated = (project: ProjectSummary): void => {
    setProjects((prev) => [project, ...prev])
  }

  const handleDeleteProject = async (id: number): Promise<void> => {
    try {
      await window.api.projects.delete(id)
      setProjects((prev) => prev.filter((project) => project.id !== id))
      onProjectDeleted?.(id)
    } catch (error) {
      console.error('Failed to delete project', error)
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
      await window.api.projects.deleteMany(ids)
      setProjects((prev) => prev.filter((project) => !selectedIds.has(project.id)))
      ids.forEach((id) => onProjectDeleted?.(id))
      setSelectedIds(new Set())
      setSelectMode(false)
    } catch (error) {
      console.error('Failed to delete selected projects', error)
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
              title: 'New project',
              content: <NewProjectModal onCreated={handleProjectCreated} />
            })
          }
        >
          <PlusIcon className="size-4" />
          New project
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
                Projects
              </span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
                {projects.length}
              </span>
            </div>
            {projects.length > 0 && (
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
            {projects.length === 0 ? (
              <div className="mx-1 mt-1 flex flex-col items-center rounded-xl border border-dashed border-sidebar-border bg-sidebar-accent/30 px-4 py-8 text-center">
                <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CircuitBoardIcon className="size-4" />
                </div>
                <p className="text-sm font-medium text-foreground">No projects yet</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Add the Gerber, drill, STEP and netlist files of a board to start testing it.
                </p>
              </div>
            ) : (
              <SidebarMenu className="gap-1.5">
                {projects.map((project) => (
                  <Collapsible key={project.id} asChild>
                    <SidebarMenuItem className="rounded-xl">
                      <div className="flex items-center gap-1">
                        {selectMode && (
                          <Checkbox
                            className="ml-2 border-primary/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                            checked={selectedIds.has(project.id)}
                            onCheckedChange={() => toggleSelected(project.id)}
                            aria-label={`Select ${project.name}`}
                          />
                        )}
                        <CollapsibleTrigger asChild>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="shrink-0 [&[data-state=open]>svg]:rotate-90"
                            aria-label={`Show files of ${project.name}`}
                          >
                            <ChevronRight className="transition-transform" />
                          </Button>
                        </CollapsibleTrigger>
                        <SidebarMenuButton
                          className="h-10 rounded-xl px-3 hover:bg-sidebar-accent"
                          onClick={() =>
                            selectMode ? toggleSelected(project.id) : onSelectProject(project)
                          }
                        >
                          {!selectMode && <CircuitBoardIcon className="text-primary" />}
                          <span className="truncate">{project.name}</span>
                        </SidebarMenuButton>
                        {!selectMode && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <SidebarMenuAction
                                showOnHover
                                className="right-2 top-2.5 size-6 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Delete ${project.name}`}
                              >
                                <Trash2Icon />
                              </SidebarMenuAction>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete project?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete &quot;{project.name}&quot; and all
                                  its files. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteProject(project.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {project.files.map((file) => (
                            <SidebarMenuSubItem
                              key={file.fileName}
                              className="flex items-center gap-2 px-2 py-1 text-xs"
                            >
                              <span className="min-w-0 flex-1 truncate" title={file.fileName}>
                                {file.fileName}
                              </span>
                              <span className="shrink-0 text-sidebar-foreground/60">
                                {FILE_KIND_LABELS[file.kind]}
                              </span>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
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
                <AlertDialogTitle>Delete {selectedIds.size} project(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the selected projects and all their files. This
                  action cannot be undone.
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
