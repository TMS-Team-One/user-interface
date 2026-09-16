import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import gerberToSvg from 'gerber-to-svg'
import { getTestById } from '../db/tests.repository'
import { getGerberParserCommand } from '../python/parser-runtime'

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

function runGerberParser(stdinInput: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let parserCommand
    try {
      parserCommand = getGerberParserCommand()
    } catch (error) {
      reject(error)
      return
    }

    const py = spawn(parserCommand.command, parserCommand.args, {
      cwd: parserCommand.cwd,
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (chunk) => (stdout += chunk))
    py.stderr.on('data', (chunk) => (stderr += chunk))
    py.on('error', reject)
    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Gerber parser exited with code ${code}`))
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

    const stdout = await runGerberParser(test.gerberFileContent)
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
