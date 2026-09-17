import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { useModal } from '@/hooks/use-modal'
import { FileUpload } from './FileUpload'
import type { ProjectFile, ProjectSummary } from '@shared/types'

function NewProjectModal({
  onCreated
}: {
  onCreated: (project: ProjectSummary) => void
}): React.JSX.Element {
  const { closeModal } = useModal()
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [name, setName] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const hasStep = files.some((file) => file.kind === 'step')

  const handleSubmit = async (): Promise<void> => {
    if (files.length === 0 || !name.trim()) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const project = await window.api.projects.create(name.trim(), files)
      onCreated(project)
      closeModal()
    } catch (error) {
      console.error('Failed to create project', error)
      const message = error instanceof Error ? error.message : String(error)
      setSubmitError(`Failed to create project: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <FileUpload files={files} onFilesChange={setFiles} name={name} onNameChange={setName} />
      {submitError && <p className="text-xs text-destructive">{submitError}</p>}
      <DialogFooter className="items-center">
        {hasStep && (
          <p className="mr-auto text-xs text-muted-foreground">
            The STEP model is converted while creating; this takes a few seconds.
          </p>
        )}
        <Button disabled={files.length === 0 || !name.trim() || submitting} onClick={handleSubmit}>
          <Plus />
          {submitting ? 'Creating...' : 'Create project'}
        </Button>
      </DialogFooter>
    </>
  )
}

export default NewProjectModal
