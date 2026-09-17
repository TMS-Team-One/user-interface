import type { ParsedPad } from '../../shared/types'
import type { NetlistPoint } from './ipc-d-356'

// A netlist point and a Gerber pad describe the same feature when they lie
// within this distance of each other (0.1 mm), in inches.
const MATCH_TOLERANCE_IN = 0.1 / 25.4

/** Fills in the net name of pads the Gerber files left unnamed, from the netlist's test points. */
export function assignNets(pads: ParsedPad[], points: NetlistPoint[]): ParsedPad[] {
  return pads.map((pad) => {
    if (pad.net_name !== null) return pad
    const match = points.find(
      (point) =>
        (point.side === 'both' || point.side === pad.side) &&
        Math.abs(point.x - pad.x) <= MATCH_TOLERANCE_IN &&
        Math.abs(point.y - pad.y) <= MATCH_TOLERANCE_IN
    )
    return match ? { ...pad, net_name: match.net } : pad
  })
}
