import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface PythonCommand {
  command: string
  args: string[]
  cwd: string
}

function packagedParserPath(): string {
  const executable = process.platform === 'win32' ? 'probe-pilot-parser.exe' : 'probe-pilot-parser'
  return join(process.resourcesPath, 'python', `${process.platform}-${process.arch}`, executable)
}

function developmentPythonPath(): string {
  const configuredPython = process.env.PROBE_PILOT_PYTHON
  if (configuredPython) return configuredPython

  const executable = process.platform === 'win32' ? 'python.exe' : 'python'
  const directory = process.platform === 'win32' ? 'Scripts' : 'bin'
  const venvPython = join(app.getAppPath(), '.venv', directory, executable)
  return existsSync(venvPython) ? venvPython : process.platform === 'win32' ? 'python' : 'python3'
}

export function getGerberParserCommand(): PythonCommand {
  if (app.isPackaged) {
    const parser = packagedParserPath()
    if (!existsSync(parser)) {
      throw new Error(
        `Packaged Gerber parser not found at ${parser}. Run npm run build:python before packaging.`
      )
    }
    return { command: parser, args: [], cwd: process.resourcesPath }
  }

  return {
    command: developmentPythonPath(),
    args: [join(app.getAppPath(), 'src', 'main', 'parsing', 'parse-gbr-files.py')],
    cwd: app.getAppPath()
  }
}

export function getHardwareBridgeCommand(): PythonCommand {
  if (app.isPackaged) {
    const executable =
      process.platform === 'win32' ? 'probe-pilot-backend.exe' : 'probe-pilot-backend'
    const backend = join(
      process.resourcesPath,
      'python',
      `${process.platform}-${process.arch}`,
      executable
    )
    if (!existsSync(backend)) {
      throw new Error(
        `Packaged hardware backend not found at ${backend}. Run npm run build:python before packaging.`
      )
    }
    return { command: backend, args: [], cwd: process.resourcesPath }
  }

  return {
    command: developmentPythonPath(),
    args: ['-u', '-m', 'src.main.hardware_bridge'],
    cwd: app.getAppPath()
  }
}
