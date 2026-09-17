import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { CameraRegistration } from '../../shared/types'

// One registration per tester: it describes the camera and the sheet on the
// bed, not a project.
function registrationFile(): string {
  return join(app.getPath('userData'), 'camera-registration.json')
}

export function getRegistration(): CameraRegistration {
  const file = registrationFile()
  if (!existsSync(file)) return { camera: null, sheet: null }
  // A file from the earlier marker-based registration has neither part.
  const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<CameraRegistration>
  return { camera: saved.camera ?? null, sheet: saved.sheet ?? null }
}

export function saveRegistration(patch: Partial<CameraRegistration>): CameraRegistration {
  const merged = { ...getRegistration(), ...patch }
  writeFileSync(registrationFile(), JSON.stringify(merged, null, 2))
  return merged
}
