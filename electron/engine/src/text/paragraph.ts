import { readFile } from 'node:fs/promises'

import type { CanvasKit, FontWeight, TextStyle, TypefaceFontProvider } from 'canvaskit-wasm'

import type { FontFace, GraphNode } from '@open-pencil/session'

import { loadCanvasKit } from '../render/kit'
import {
  textContent,
  textFamily,
  textFontSize,
  textItalic,
  textLayoutWidth,
  textLetterSpacing,
  textLineHeight,
  textWeight
} from './fields'
import type { TextSize } from './types'

interface ParagraphHost {
  readonly ck: CanvasKit
  readonly provider: TypefaceFontProvider
  readonly registered: Set<string>
}

const fontBytes = new Map<string, Promise<Uint8Array | null>>()

let hostPromise: Promise<ParagraphHost | null> | null = null

/**
 * Measures `node` with CanvasKit paragraph and `font`'s file.
 * Returns null when paragraph is unavailable or the file cannot be shaped.
 */
export async function shapeText(node: GraphNode, font: FontFace): Promise<TextSize | null> {
  if (font.path.trim().length === 0) return null
  const host = await paragraphHost()
  if (!host) return null
  const bytes = await loadFontBytes(font.path)
  if (!bytes) return null
  try {
    return measureParagraph(host, node, font, bytes)
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    console.warn(`CanvasKit paragraph did not measure text: ${detail}`)
    return null
  }
}

function paragraphHost(): Promise<ParagraphHost | null> {
  hostPromise ??= loadParagraphHost()
  return hostPromise
}

async function loadParagraphHost(): Promise<ParagraphHost | null> {
  try {
    const ck = await loadCanvasKit()
    return { ck, provider: ck.TypefaceFontProvider.Make(), registered: new Set() }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    console.warn(`CanvasKit paragraph did not load under bun: ${detail}`)
    return null
  }
}

function loadFontBytes(path: string): Promise<Uint8Array | null> {
  const cached = fontBytes.get(path)
  if (cached) return cached
  const reading = readAndCache(path)
  fontBytes.set(path, reading)
  return reading
}

async function readAndCache(path: string): Promise<Uint8Array | null> {
  const bytes = await readFontFile(path)
  if (!bytes && fontBytes.get(path) !== undefined) fontBytes.delete(path)
  return bytes
}

async function readFontFile(path: string): Promise<Uint8Array | null> {
  try {
    const bytes = await readFile(path)
    if (bytes.byteLength === 0) {
      console.warn(`Font file is empty: ${path}`)
      return null
    }
    return bytes
  } catch (error: unknown) {
    if (!isMissingFile(error)) {
      const detail = error instanceof Error ? error.message : 'unknown error'
      console.warn(`Font file did not load: ${path}: ${detail}`)
    }
    return null
  }
}

function isMissingFile(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  return error.code === 'ENOENT'
}

function measureParagraph(
  host: ParagraphHost,
  node: GraphNode,
  font: FontFace,
  bytes: Uint8Array
): TextSize | null {
  const content = textContent(node)
  const family = shapingFamily(node, font)
  registerFace(host, font.path, family, bytes)
  const builder = host.ck.ParagraphBuilder.MakeFromFontProvider(
    new host.ck.ParagraphStyle({
      textStyle: paragraphTextStyle(
        host.ck,
        node,
        family,
        textWeight(node, font.weight),
        textItalic(node, font.style)
      )
    }),
    host.provider
  )
  try {
    builder.addText(content)
    const paragraph = builder.build()
    try {
      paragraph.layout(textLayoutWidth(node))
      return shapedSize(content, paragraph.getLongestLine(), paragraph.getHeight())
    } finally {
      paragraph.delete()
    }
  } finally {
    builder.delete()
  }
}

function registerFace(host: ParagraphHost, path: string, family: string, bytes: Uint8Array): void {
  const key = `${path}\0${family}`
  if (host.registered.has(key)) return
  host.provider.registerFont(bytes, family)
  host.registered.add(key)
}

function shapingFamily(node: GraphNode, font: FontFace): string {
  const family = font.family.trim()
  return family.length > 0 ? family : textFamily(node)
}

function paragraphTextStyle(
  ck: CanvasKit,
  node: GraphNode,
  family: string,
  weight: number,
  italic: boolean
): TextStyle {
  const style: TextStyle = {
    color: ck.BLACK,
    fontFamilies: [family],
    fontSize: textFontSize(node),
    fontStyle: {
      weight: canvasWeight(ck, weight),
      width: ck.FontWidth.Normal,
      slant: italic ? ck.FontSlant.Italic : ck.FontSlant.Upright
    }
  }
  const letterSpacing = textLetterSpacing(node)
  if (letterSpacing !== undefined) style.letterSpacing = letterSpacing
  const lineHeight = textLineHeight(node)
  if (lineHeight !== undefined) style.heightMultiplier = lineHeight
  return style
}

function canvasWeight(ck: CanvasKit, weight: number): FontWeight {
  if (weight >= 950) return ck.FontWeight.ExtraBlack
  if (weight >= 850) return ck.FontWeight.Black
  if (weight >= 750) return ck.FontWeight.ExtraBold
  if (weight >= 650) return ck.FontWeight.Bold
  if (weight >= 550) return ck.FontWeight.SemiBold
  if (weight >= 450) return ck.FontWeight.Medium
  if (weight >= 350) return ck.FontWeight.Normal
  if (weight >= 250) return ck.FontWeight.Light
  if (weight >= 150) return ck.FontWeight.ExtraLight
  if (weight >= 50) return ck.FontWeight.Thin
  return ck.FontWeight.Invisible
}

/** A non-empty string with no advance, or a zero line height, did not shape. */
function shapedSize(content: string, rawWidth: number, rawHeight: number): TextSize | null {
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) return null
  const width = Number.isFinite(rawWidth) && rawWidth >= 0 ? rawWidth : 0
  if (content.length > 0 && width === 0) return null
  return { width, height: rawHeight }
}
