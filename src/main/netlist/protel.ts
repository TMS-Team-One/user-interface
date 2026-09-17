// Altium's Protel netlist: component blocks "[ refdes, footprint, value ]" and
// net blocks "( name, then one REFDES-PIN per line )". It says which pins share
// a net but carries no coordinates, so it cannot place a net on a pad; that
// takes an IPC-D-356 export.

export interface ProtelComponent {
  refdes: string
  footprint: string
  value: string
}

export interface ProtelNet {
  name: string
  /** Pins as "REFDES-PIN", e.g. "U1-20". */
  pins: string[]
}

export interface ProtelNetlist {
  components: ProtelComponent[]
  nets: ProtelNet[]
}

const BLOCK_RE = /^([[(])\r?\n([\s\S]*?)^[\])]\s*$/gm

export function isProtelNetlist(content: string): boolean {
  return /^\[\r?\n/.test(content.replace(/^\uFEFF/, '')) && /^\(\r?\n/m.test(content)
}

export function parseProtel(content: string): ProtelNetlist {
  const components: ProtelComponent[] = []
  const nets: ProtelNet[] = []
  for (const match of content.replace(/^\uFEFF/, '').matchAll(BLOCK_RE)) {
    const [, opener, body] = match
    const lines = body.split(/\r?\n/).map((line) => line.trim())
    if (opener === '[') {
      const [refdes = '', footprint = '', value = ''] = lines
      if (refdes) components.push({ refdes, footprint, value })
    } else {
      const [name = '', ...pins] = lines
      if (name) nets.push({ name, pins: pins.filter((pin) => pin.length > 0) })
    }
  }
  return { components, nets }
}
