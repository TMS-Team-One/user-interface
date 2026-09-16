import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { useModal } from '@/hooks/use-modal'
import { FileUpload } from './FileUpload'
import type { TestSummary } from '@shared/types'

function AddTestCaseModal({
  onCreated
}: {
  onCreated: (test: TestSummary) => void
}): React.JSX.Element {
  const { closeModal } = useModal()
  const [file, setFile] = useState<File | null>(null)
  const [testName, setTestName] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async (): Promise<void> => {
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

export default AddTestCaseModal
