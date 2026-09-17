import { app } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'

export const PYTHON_EXECUTABLE = process.platform === 'win32' ? 'python' : 'python3'
// The Python side of the tester (test runner, board localisation, chat agent,
// firmware), kept in this repository; its scripts run as modules from there.
export const BACKEND_DIR = join(app.getAppPath(), 'backend')

/** Runs one of the backend's scripts to completion, feeding it `stdin`. */
export function runBackend(
  args: string[],
  stdin = ''
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_EXECUTABLE, ['-m', ...args], { cwd: BACKEND_DIR })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(stdin)
  })
}
