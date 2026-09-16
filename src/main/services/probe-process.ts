import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { getHardwareBridgeCommand } from '../python/parser-runtime'

interface BridgeResponse<T> {
  id: number
  ok: boolean
  result?: T
  error?: string
  message?: string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

class ProbeProcess {
  private child: ChildProcessWithoutNullStreams | undefined
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()

  request<T>(method: string): Promise<T> {
    const child = this.ensureStarted()
    const id = this.nextId++

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Hardware request '${method}' timed out`))
      }, 60_000)

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout
      })

      child.stdin.write(`${JSON.stringify({ id, method })}\n`, (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        if (!pending) return
        clearTimeout(pending.timeout)
        this.pending.delete(id)
        pending.reject(error)
      })
    })
  }

  stop(): void {
    if (this.child && !this.child.killed) {
      this.child.stdin.end()
    }
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) return this.child

    const { command, args, cwd } = getHardwareBridgeCommand()
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child

    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => this.handleLine(line))
    child.stderr.on('data', (chunk) => console.error(`[probe-pilot-backend] ${chunk}`))
    child.on('error', (error) => this.handleExit(error))
    child.on('exit', (code, signal) => {
      this.handleExit(
        new Error(`Hardware backend exited (code=${String(code)}, signal=${String(signal)})`)
      )
    })

    return child
  }

  private handleLine(line: string): void {
    let response: BridgeResponse<unknown>
    try {
      response = JSON.parse(line) as BridgeResponse<unknown>
    } catch {
      console.error(`Hardware backend returned invalid JSON: ${line}`)
      return
    }

    const pending = this.pending.get(response.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pending.delete(response.id)
    if (response.ok) {
      pending.resolve(response.result)
    } else {
      pending.reject(new Error(response.message || response.error || 'Hardware request failed'))
    }
  }

  private handleExit(error: Error): void {
    if (!this.child) return
    this.child = undefined
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

export const probeProcess = new ProbeProcess()
