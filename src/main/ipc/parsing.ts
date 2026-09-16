import { app, ipcMain } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import gerberToSvg from 'gerber-to-svg'
import { getTestById } from '../db/tests.repository'

const PYTHON_EXECUTABLE = process.platform === 'win32' ? 'python' : 'python3'
const PARSE_GBR_SCRIPT = join(app.getAppPath(), 'src', 'main', 'parsing', 'parse-gbr-files.py')

function renderGerberSvg(gerberFileContent: string, id: string): Promise<string> {
  return new Promise((resolve, reject) => {
    gerberToSvg(gerberFileContent, { id }, (error, svg) => {
      if (error) {
        reject(error)
        return
      }
      resolve(svg)
    })
  })
}

function runPythonScript(scriptPath: string, stdinInput: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn(PYTHON_EXECUTABLE, [scriptPath])
    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (chunk) => (stdout += chunk))
    py.stderr.on('data', (chunk) => (stderr += chunk))
    py.on('error', reject)
    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `${scriptPath} exited with code ${code}`))
        return
      }
      resolve(stdout)
    })

    py.stdin.write(stdinInput)
    py.stdin.end()
  })
}

export function registerParsingIpc(): void {
  ipcMain.handle('parsing:parseGerber', async (_event, testId: number) => {
    const test = getTestById(testId)
    if (!test) {
      throw new Error(`No test found with id ${testId}`)
    }

    const stdout = await runPythonScript(PARSE_GBR_SCRIPT, test.gerberFileContent)
    return JSON.parse(stdout)
  })

  ipcMain.handle('parsing:renderGerberSvg', async (_event, testId: number) => {
    const test = getTestById(testId)
    if (!test) {
      throw new Error(`No test found with id ${testId}`)
    }

    return renderGerberSvg(test.gerberFileContent, `gerber-${testId}`)
  })
}
