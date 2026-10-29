export const SPACING_SCALE = [0, 1, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 128]

export const RADIUS_SCALE = [0, 2, 4, 6, 8, 12, 16, 20, 24, 32]

export const PILL_RADIUS = 9999

const DEFAULT_NAME =
  /^(Frame|Rectangle|Ellipse|Line|Text|Group|Vector|Polygon|Star|Section|Component|Instance|Slice)\s*\d*$/i

export function isDefaultName(name: string): boolean {
  return DEFAULT_NAME.test(name)
}

/** Whole words of a layer name, split on separators and camelCase humps. */
export function nameWords(name: string): string[] {
  const pieces = name
    .replaceAll(/([a-z\d])([A-Z])/g, '$1 $2')
    .replaceAll(/([a-z])(\d)/gi, '$1 $2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
  const words: string[] = []
  for (const word of pieces) if (word.length > 0) words.push(word)
  return words
}

export function isMultipleOf(value: number, base: number, tolerance = 0.01): boolean {
  if (base === 0) return false
  const remainder = value % base
  return remainder < tolerance || base - remainder < tolerance
}

/** The candidate closest to `value`. A tie goes to the larger candidate. */
export function nearestValue(value: number, candidates: readonly number[]): number | undefined {
  let best: number | undefined
  for (const candidate of candidates) {
    if (best === undefined) {
      best = candidate
      continue
    }
    const distance = Math.abs(candidate - value)
    const bestDistance = Math.abs(best - value)
    if (distance < bestDistance || (distance === bestDistance && candidate > best)) best = candidate
  }
  return best
}
