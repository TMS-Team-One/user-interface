'use client'

import { useState } from 'react'
import { cn } from 'cn'
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction
} from '@/components/ui/attachment'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UploadCloud, FileText, X } from 'lucide-react'

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const GERBER_FILE_EXTENSIONS = new Set([
  'gbr',
  'gtl',
  'gbl',
  'gts',
  'gbs',
  'gtp',
  'gbp',
  'gm1',
  'gm2',
  'gm3',
  'gm4',
  'gm6',
  'gm8',
  'gm10',
  'gm13',
  'gm15',
  'gd1',
  'gg1',
  'apr',
  'apr_lib',
  'rep',
  'extrep',
  'rul'
])

const isGerberFile = (file: File) => {
  const name = file.name.toLowerCase()
  const lastDot = name.lastIndexOf('.')
  if (lastDot <= 0) return false
  return GERBER_FILE_EXTENSIONS.has(name.slice(lastDot + 1))
}

function stripExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName
}

export function FileUpload({
  onFileChange,
  onTestNameChange
}: {
  onFileChange?: (file: File | null) => void
  onTestNameChange?: (testName: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testName, setTestName] = useState('')

  const acceptFile = (candidate: File) => {
    if (!isGerberFile(candidate)) {
      setError('Only Gerber layer files are supported')
      return
    }
    setError(null)
    setFile(candidate)
    onFileChange?.(candidate)
    const defaultTestName = stripExtension(candidate.name)
    setTestName(defaultTestName)
    onTestNameChange?.(defaultTestName)
  }

  const handleTestNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTestName(e.target.value)
    onTestNameChange?.(e.target.value)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      acceptFile(e.target.files[0])
    }
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      acceptFile(e.dataTransfer.files[0])
    }
  }

  const removeFile = () => {
    setFile(null)
    setError(null)
    onFileChange?.(null)
    setTestName('')
    onTestNameChange?.('')
  }

  return (
    <div className="w-full space-y-4">
      <div className="grid w-full items-center gap-1.5">
        {file ? (
          <>
            <Attachment state="done" size="default" orientation="horizontal" className="w-full">
              <AttachmentMedia variant="icon">
                <FileText />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{file.name}</AttachmentTitle>
                <AttachmentDescription>{formatFileSize(file.size)}</AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction onClick={removeFile} aria-label="Remove file">
                  <X />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="test-name">Test name</Label>
              <Input
                id="test-name"
                value={testName}
                onChange={handleTestNameChange}
                placeholder="Test name"
              />
            </div>
          </>
        ) : (
          <>
            <Attachment
              state={error ? 'error' : 'idle'}
              size="default"
              orientation="horizontal"
              className={cn(
                'relative w-full min-w-0 min-h-44 justify-center transition-colors',
                isDragging && 'border-primary bg-primary/5'
              )}
            >
              <label
                htmlFor="file-upload"
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-2 text-center outline-none"
              >
                <div
                  className={cn(
                    'flex size-12 items-center justify-center rounded-full transition-colors',
                    error
                      ? 'bg-destructive/10 text-destructive'
                      : isDragging
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  <UploadCloud className="size-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    <span className="text-primary">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">Gerber layer files only</p>
                </div>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".gbr,.gtl,.gbl,.gts,.gbs,.gtp,.gbp,.gm1,.gm2,.gm3,.gm4,.gm6,.gm8,.gm10,.gm13,.gm15,.gd1,.gg1,.apr,.apr_lib,.rep,.extrep,.rul"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </Attachment>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
