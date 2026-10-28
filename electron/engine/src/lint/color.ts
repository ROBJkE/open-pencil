export interface RGB {
  readonly r: number
  readonly g: number
  readonly b: number
}

export interface RGBA extends RGB {
  readonly a: number
}

const HEX = /^#?([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function parseHexColor(input: string): RGBA | undefined {
  const match = HEX.exec(input.trim())
  const body = match?.[1]
  if (!body) return undefined
  const expanded = body.length <= 4 ? expandShort(body) : body
  if (expanded.length !== 6 && expanded.length !== 8) return undefined
  const red = byte(expanded, 0)
  const green = byte(expanded, 2)
  const blue = byte(expanded, 4)
  const alpha = expanded.length === 8 ? byte(expanded, 6) : 1
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    return undefined
  }
  return { r: red, g: green, b: blue, a: alpha }
}

export function colorToHex(color: RGB): string {
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

export function opaque(color: RGB): RGB {
  return { r: color.r, g: color.g, b: color.b }
}

/** Opaque color seen when `foreground` at `alpha` is drawn over an opaque `background`. */
export function compositeOver(foreground: RGB, background: RGB, alpha: number): RGB {
  const mix = (top: number, bottom: number) => top * alpha + bottom * (1 - alpha)
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b)
  }
}

/** WCAG 2 contrast ratio, from 1 to 21. Alpha is ignored, so composite first. */
export function contrastRatio(a: RGB, b: RGB): number {
  const left = luminance(a)
  const right = luminance(b)
  const lighter = Math.max(left, right)
  const darker = Math.min(left, right)
  return (lighter + 0.05) / (darker + 0.05)
}

function expandShort(body: string): string {
  let expanded = ''
  for (const char of body) expanded = `${expanded}${char}${char}`
  return expanded
}

function byte(hex: string, offset: number): number | undefined {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16)
  if (!Number.isFinite(value)) return undefined
  return value / 255
}

function channel(value: number): string {
  const clamped = Math.min(1, Math.max(0, value))
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
}

function luminance(color: RGB): number {
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b)
}

function linear(value: number): number {
  if (value <= 0.04045) return value / 12.92
  return ((value + 0.055) / 1.055) ** 2.4
}
