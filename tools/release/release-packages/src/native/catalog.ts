import { releaseVersion } from './context.ts'

export const desktopBuilds = [
  {
    target: 'aarch64-apple-darwin',
    platform: 'macos-latest',
    label: 'macos-arm64',
    saveBunCache: true
  },
  {
    target: 'x86_64-apple-darwin',
    platform: 'macos-latest',
    label: 'macos-x64',
    saveBunCache: false
  },
  {
    target: 'x86_64-pc-windows-msvc',
    platform: 'windows-latest',
    label: 'windows-x64',
    saveBunCache: true
  },
  {
    target: 'aarch64-pc-windows-msvc',
    platform: 'windows-latest',
    label: 'windows-arm64',
    saveBunCache: false
  },
  {
    target: 'x86_64-unknown-linux-gnu',
    platform: 'ubuntu-22.04',
    label: 'linux-x64',
    saveBunCache: true
  }
] as const

export const desktopTargets = desktopBuilds.map((build) => build.target)

export type DesktopTarget = (typeof desktopTargets)[number]

export interface DesktopAsset {
  source: string
  name: string
  updaterKeys: string[]
  signed: boolean
}

/** One unsigned Iced binary per desktop target. `source` is the Cargo filename. */
export function desktopAssets(target: DesktopTarget, version: string): DesktopAsset[] {
  releaseVersion(`v${version}`)
  const windows = target.includes('windows')
  const source = windows ? 'OpenPencil.exe' : 'OpenPencil'
  const name = windows ? `OpenPencil-${target}.exe` : `OpenPencil-${target}`
  return [{ source, name, updaterKeys: [], signed: false }]
}
