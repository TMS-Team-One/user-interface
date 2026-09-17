import type { LiveEvent, RunTarget } from '@shared/types'
import { useEffect, useState } from 'react'

export interface Contact {
  target: RunTarget
  voltage: number
}

export interface LiveRun {
  running: boolean
  backend: 'ultimaker' | 'simulated' | null
  instrument: 'ads1115' | 'simulated' | null
  targets: number
  move: Extract<LiveEvent, { type: 'move' }> | null
  target: RunTarget | null
  contacts: Contact[]
  error: string | null
}

const IDLE: LiveRun = {
  running: false,
  backend: null,
  instrument: null,
  targets: 0,
  move: null,
  target: null,
  contacts: [],
  error: null
}

function reduce(run: LiveRun, event: LiveEvent): LiveRun {
  switch (event.type) {
    case 'started':
      return {
        ...IDLE,
        running: true,
        backend: event.backend,
        instrument: event.instrument,
        targets: event.targets
      }
    case 'move':
      return { ...run, move: event }
    case 'target':
      return { ...run, target: event.target }
    case 'contact':
      return {
        ...run,
        contacts: [...run.contacts, { target: event.target, voltage: event.voltage }]
      }
    case 'error':
      return { ...run, error: event.message }
    case 'finished':
      return { ...run, running: false, move: null, target: null }
    case 'log':
      return run
  }
}

/** The state of the current test run, kept up to date from the runner's events. */
export function useLiveRun(): LiveRun {
  const [run, setRun] = useState<LiveRun>(IDLE)

  useEffect(() => window.api.live.onEvent((event) => setRun((prev) => reduce(prev, event))), [])

  return run
}
