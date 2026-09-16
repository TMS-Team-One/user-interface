import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const platformArgumentIndex = process.argv.indexOf('--platform')
const requestedPlatform =
  platformArgumentIndex === -1 ? process.platform : process.argv[platformArgumentIndex + 1]

if (!requestedPlatform) {
  throw new Error('--platform requires a value')
}
if (requestedPlatform !== process.platform) {
  throw new Error(
    `Cannot build the ${requestedPlatform} Python executables on ${process.platform}. ` +
      'PyInstaller builds must run on the target operating system.'
  )
}

const executableExtension = process.platform === 'win32' ? '.exe' : ''
const venvPython =
  process.platform === 'win32'
    ? join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : join(projectRoot, '.venv', 'bin', 'python')
const python = process.env.PROBE_PILOT_PYTHON || (existsSync(venvPython) ? venvPython : 'python3')
const target = `${process.platform}-${process.arch}`
const distPath = join(projectRoot, 'resources', 'python', target)
const buildRoot = join(projectRoot, '.python-build', target)
const specPath = join(buildRoot, 'spec')
const cachePath = join(buildRoot, 'cache')
const executables = [
  {
    name: 'probe-pilot-parser',
    entryPoint: join(projectRoot, 'src', 'main', 'parsing', 'parse-gbr-files.py'),
    extraArgs: []
  },
  {
    name: 'probe-pilot-backend',
    entryPoint: join(projectRoot, 'src', 'main', 'hardware_bridge.py'),
    // create_chat_model loads provider packages dynamically, so PyInstaller
    // cannot discover the OpenAI integration through static imports alone.
    extraArgs: ['--collect-all', 'langchain_openai']
  }
]

mkdirSync(distPath, { recursive: true })
mkdirSync(specPath, { recursive: true })
mkdirSync(cachePath, { recursive: true })

for (const executable of executables) {
  const workPath = join(buildRoot, 'work', executable.name)
  mkdirSync(workPath, { recursive: true })

  const result = spawnSync(
    python,
    [
      '-m',
      'PyInstaller',
      '--clean',
      '--noconfirm',
      '--onefile',
      '--name',
      executable.name,
      '--distpath',
      distPath,
      '--workpath',
      workPath,
      '--specpath',
      specPath,
      ...executable.extraArgs,
      executable.entryPoint
    ],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, PYINSTALLER_CONFIG_DIR: cachePath }
    }
  )

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)

  console.log(`Built ${join(distPath, `${executable.name}${executableExtension}`)}`)
}
