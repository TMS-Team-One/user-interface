import { ChevronRight, PlusIcon, RefreshCcw, Trash2Icon, XIcon } from 'lucide-react'
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

  const { connectionEstablished } = useConnection()

  return (
    <Sidebar>
      <SidebarHeader className="flex mt-2 mx-2">
        <h1 className="text-black text-2xl font-semibold font-sans">Probe Pilot</h1>
        <div className="w-full flex justify-center">
          <Button
            className="w-fit justify-start"
            onClick={() =>
              openModal({
                title: 'New project',
                content: <NewProjectModal onCreated={handleProjectCreated} />
              })
            }
          >
            <PlusIcon />
            New project
          </Button>
        </div>
        {projects.length > 0 && (
          <div className="w-full flex justify-center">
            <Button className="w-fit justify-start" variant="ghost" onClick={toggleSelectMode}>
              {selectMode ? (
                <>
                  <XIcon />
                  Cancel
                </>
              ) : (
                'Select'
              )}
            </Button>
          </div>
        )}
      </SidebarHeader>
      <div className="p-2">
        <Separator />
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {projects.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-sidebar-foreground/70">No projects yet.</p>
            ) : (
              <SidebarMenu>
                {projects.map((project) => (
                  <Collapsible key={project.id} asChild>
                    <SidebarMenuItem>
                      <div className="flex items-center gap-1">
                        {selectMode && (
                          <Checkbox
                            className="ml-2"
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
                          onClick={() =>
                            selectMode ? toggleSelected(project.id) : onSelectProject(project)
                          }
                        >
                          {project.name}
                        </SidebarMenuButton>
                        {!selectMode && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <SidebarMenuAction
                                showOnHover
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
