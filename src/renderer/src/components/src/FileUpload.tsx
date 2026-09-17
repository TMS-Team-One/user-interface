'use client'

import { useState } from 'react'
import { cn } from 'cn'
import { Attachment } from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { UploadCloud, FileText, X } from 'lucide-react'
import type { FileKind, LayerSide, LayerType, ProjectFile } from '@shared/types'
import { identifyFile } from '@shared/file-kinds'
import { identifyLayer } from '@shared/gerber-layers'

const FILE_KIND_LABELS: Record<FileKind, string> = {
  gerber: 'Gerber layer',
  drill: 'Drill file',
  step: 'STEP model',
  netlist: 'Netlist',
  unknown: 'Not used'
}

const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  copper: 'Copper',
  soldermask: 'Solder mask',
  silkscreen: 'Silkscreen',
  solderpaste: 'Solder paste',
  drill: 'Drill',
  outline: 'Outline'
}

const LAYER_SIDE_LABELS: Record<LayerSide, string> = {
  top: 'Top',
  bottom: 'Bottom',
  inner: 'Inner',
  all: 'Both'
}

// How much of an unrecognised file the AI fallback gets to see.
const AI_HEAD_CHARS = 2000

function stripExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName
}

// Reads a dropped file and works out what it is: the deterministic rules first,
// the AI fallback in the main process for whatever they cannot place.
async function readProjectFile(file: File): Promise<ProjectFile> {
  const content = await file.text()
  let classification = identifyFile(file.name, content)
  if (classification.kind === 'unknown') {
    classification =
      (await window.api.parsing.classifyFile(file.name, content.slice(0, AI_HEAD_CHARS))) ??
      classification
  }
  return { fileName: file.name, content, ...classification }
}

export function FileUpload({
  files,
  onFilesChange,
  name,
  onNameChange
}: {
  files: ProjectFile[]
  onFilesChange: (files: ProjectFile[]) => void
  name: string
  onNameChange: (name: string) => void
}): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [reading, setReading] = useState(false)

  const addFiles = async (candidates: File[]): Promise<void> => {
    const fresh = candidates.filter(
      (file) => !files.some((existing) => existing.fileName === file.name)
    )
    if (fresh.length === 0) return

    setReading(true)
    try {
      const added = await Promise.all(fresh.map(readProjectFile))
      onFilesChange([...files, ...added])
      if (!name) onNameChange(stripExtension(added[0].fileName))
    } finally {
      setReading(false)
    }
  }

  const updateFile = (index: number, patch: Partial<ProjectFile>): void => {
    onFilesChange(files.map((file, i) => (i === index ? { ...file, ...patch } : file)))
  }

  const setKind = (index: number, kind: FileKind): void => {
    const file = files[index]
    if (kind === 'gerber') {
      updateFile(index, { kind, ...identifyLayer(file.fileName, file.content) })
    } else if (kind === 'drill') {
      updateFile(index, { kind, layerType: 'drill', layerSide: 'all' })
    } else {
      updateFile(index, { kind, layerType: null, layerSide: null })
    }
  }

  const setLayerType = (index: number, value: string): void => {
    const layerType = (value || null) as LayerType | null
    let layerSide: LayerSide | null = files[index].layerSide ?? 'top'
    if (layerType === null) layerSide = null
    else if (layerType === 'drill' || layerType === 'outline') layerSide = 'all'
    updateFile(index, { layerType, layerSide })
  }

  const removeFile = (index: number): void => {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
    }
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>): void => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files))
    }
  }

  return (
    <div className="w-full space-y-4">
      {files.length > 0 && (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {files.map((file, index) => (
            <div key={file.fileName} className="flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm" title={file.fileName}>
                {file.fileName}
              </span>
              <NativeSelect
                size="sm"
                value={file.kind}
                onChange={(e) => setKind(index, e.target.value as FileKind)}
                aria-label={`Kind of ${file.fileName}`}
              >
                {Object.entries(FILE_KIND_LABELS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {file.kind === 'gerber' && (
                <>
                  <NativeSelect
                    size="sm"
                    value={file.layerType ?? ''}
                    onChange={(e) => setLayerType(index, e.target.value)}
                    aria-label={`Layer type of ${file.fileName}`}
                  >
                    <NativeSelectOption value="">Not drawn</NativeSelectOption>
                    {Object.entries(LAYER_TYPE_LABELS).map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    size="sm"
                    value={file.layerSide ?? 'all'}
                    disabled={file.layerType === null}
                    onChange={(e) => updateFile(index, { layerSide: e.target.value as LayerSide })}
                    aria-label={`Side of ${file.fileName}`}
                  >
                    {Object.entries(LAYER_SIDE_LABELS).map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </>
              )}
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => removeFile(index)}
                aria-label={`Remove ${file.fileName}`}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Attachment
        state="idle"
        size="default"
        orientation="horizontal"
        className={cn(
          'relative w-full min-w-0 min-h-32 justify-center transition-colors',
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
              isDragging ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            <UploadCloud className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              <span className="text-primary">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">
              {reading
                ? 'Reading files...'
                : 'Gerber layers, drill files, a STEP model and a netlist of one board'}
            </p>
          </div>
          <Input
            id="file-upload"
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      </Attachment>
      {files.length > 0 && (
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Project name"
          />
        </div>
      )}
    </div>
  )
}
