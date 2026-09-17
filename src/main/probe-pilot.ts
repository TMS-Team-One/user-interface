import { app } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'

export const PYTHON_EXECUTABLE = process.platform === 'win32' ? 'python' : 'python3'
// The probe-pilot checkout next to this app; PROBE_PILOT_DIR overrides it.
export const PROBE_PILOT_DIR =
  process.env.PROBE_PILOT_DIR ?? join(app.getAppPath(), '..', 'probe-pilot')

/** Runs one of probe-pilot's scripts to completion, feeding it `stdin`. */
export function runProbePilot(
  args: string[],
  stdin = ''
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_EXECUTABLE, ['-m', ...args], { cwd: PROBE_PILOT_DIR })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(stdin)
  })
}
