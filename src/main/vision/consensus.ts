import type { LocalisationResult } from '../../shared/types'

// Two poses are the same board position when their origins in the image and
// their angles are this close.
const SAME_ORIGIN_PX = 3
const SAME_ANGLE_DEG = 1

function origin(H: number[][]): [number, number] {
  return [H[0][2] / H[2][2], H[1][2] / H[2][2]]
}

function angleDeg(H: number[][]): number {
  // Direction of the board's x axis in the image, from the homography's Jacobian at the origin.
  return (Math.atan2(H[1][0], H[0][0]) * 180) / Math.PI
}

function samePose(a: number[][], b: number[][]): boolean {
  const [ax, ay] = origin(a)
  const [bx, by] = origin(b)
  const turn = Math.abs(((angleDeg(a) - angleDeg(b) + 540) % 360) - 180)
  return Math.hypot(ax - bx, ay - by) <= SAME_ORIGIN_PX && turn <= SAME_ANGLE_DEG
}

/**
 * The localisation most frames agree on. A pose passes only when the majority
 * of the frames found it; with one frame that is the frame's own verdict. When
 * no frame passes, the one with the best rim support is returned for display.
 */
export function agreedLocalisation(results: LocalisationResult[]): {
  index: number
  result: LocalisationResult
} {
  const passing = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.fit?.pass && result.board_to_image)
  const needed = Math.floor(results.length / 2) + 1

  let best: { index: number; agreeing: number; support: number } | null = null
  for (const candidate of passing) {
    const agreeing = passing.filter(({ result }) =>
      samePose(candidate.result.board_to_image!, result.board_to_image!)
    ).length
    const support = candidate.result.fit?.outline_support ?? 0
    if (
      !best ||
      agreeing > best.agreeing ||
      (agreeing === best.agreeing && support > best.support)
    ) {
      best = { index: candidate.index, agreeing, support }
    }
  }

  if (best) {
    const result = results[best.index]
    return {
      index: best.index,
      result: {
        ...result,
        fit: {
          ...result.fit!,
          pass: best.agreeing >= needed,
          frames: results.length,
          agreeing: best.agreeing
        }
      }
    }
  }

  let index = 0
  for (const [candidate, result] of results.entries()) {
    if ((result.fit?.outline_support ?? -1) > (results[index].fit?.outline_support ?? -1)) {
      index = candidate
    }
  }
  const result = results[index]
  return {
    index,
    result: result.fit
      ? { ...result, fit: { ...result.fit, frames: results.length, agreeing: 0 } }
      : result
  }
}
