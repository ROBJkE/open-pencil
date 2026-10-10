import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'

import { appArtwork, loadArtwork } from './artwork.ts'
import { desktopFiles } from './config.ts'
import { canonicalIcns } from './validate.ts'
import type { BrandFiles } from './web.ts'

const ICO_SIZES = [16, 24, 32, 48, 64, 256] as const

const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024]
] as const

function pngSize(name: string): number {
  if (name === '128x128@2x.png') return 256
  if (name === 'icon.png') return 512
  if (name === 'StoreLogo.png') return 50
  const size = name.match(/Square(\d+)/)?.[1] ?? name.match(/^(\d+)x/)?.[1]
  if (!size) throw new Error(`Unknown desktop icon size: ${name}`)
  return Number(size)
}

async function raster(source: string, size: number): Promise<Buffer> {
  return sharp(source).resize(size, size, { fit: 'fill' }).ensureAlpha().png().toBuffer()
}

function ico(frames: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + frames.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  let offset = header.length
  const parts: Buffer[] = [header]
  for (const [index, frame] of frames.entries()) {
    const entry = 6 + index * 16
    const dimension = frame.size >= 256 ? 0 : frame.size
    header[entry] = dimension
    header[entry + 1] = dimension
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(frame.png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += frame.png.length
    parts.push(frame.png)
  }
  return Buffer.concat(parts)
}

function icns(frames: { type: string; png: Buffer }[]): Buffer {
  const chunks = frames.map((frame) => {
    const chunk = Buffer.alloc(8 + frame.png.length)
    chunk.write(frame.type, 0, 4, 'ascii')
    chunk.writeUInt32BE(chunk.length, 4)
    frame.png.copy(chunk, 8)
    return chunk
  })
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(8 + body.length, 4)
  return Buffer.concat([header, body])
}

export async function generateDesktop(root: string): Promise<BrandFiles> {
  const directory = await mkdtemp(join(tmpdir(), 'open-pencil-icons-'))
  try {
    const { adapter, main } = await loadArtwork(root)
    const source = join(directory, 'app.svg')
    await writeFile(source, appArtwork(main, adapter, 'desktop'))
    const files: BrandFiles = new Map()
    const rendered = new Map<number, Buffer>()
    async function png(size: number): Promise<Buffer> {
      const cached = rendered.get(size)
      if (cached) return cached
      const bytes = await raster(source, size)
      rendered.set(size, bytes)
      return bytes
    }
    for (const name of desktopFiles) {
      if (name.endsWith('.png')) files.set(name, await png(pngSize(name)))
    }
    files.set(
      'icon.ico',
      ico(await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await png(size) }))))
    )
    files.set(
      'icon.icns',
      canonicalIcns(
        icns(
          await Promise.all(
            ICNS_TYPES.map(async ([type, size]) => ({ type, png: await png(size) }))
          )
        )
      )
    )
    return files
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
