import { useLocalStorage } from '@vueuse/core'
import { watch } from 'vue'

import {
  DEFAULT_WEB_FONT_PROVIDER_SETTINGS,
  WEB_FONT_PROVIDER_IDS,
  collectGraphFontRequirements,
  fontManager,
  missingGraphFontScripts,
  type FontFamilyOption,
  type LocalFontAccessState,
  type WebFontProviderId,
} from '@open-pencil/core/text'
import type { SceneGraph } from '@open-pencil/scene-graph'

import { browserWebFontFetch } from '@/app/editor/fonts/browser-fetch'

if (typeof navigator !== 'undefined') {
  fontManager.setFallbackUserAgent(navigator.userAgent)
}

export type FontProviderSettings = Record<WebFontProviderId, boolean>

export const onlineFontsEnabled = useLocalStorage('op-online-fonts-enabled', true)
export const fontProviderSettings = useLocalStorage<FontProviderSettings>(
  'op-font-providers',
  DEFAULT_WEB_FONT_PROVIDER_SETTINGS
)

watch(
  [onlineFontsEnabled, fontProviderSettings],
  () => {
    fontManager.setOnlineFontProviders(
      onlineFontsEnabled.value
        ? Object.fromEntries(
            WEB_FONT_PROVIDER_IDS.map((provider) => [
              provider,
              fontProviderSettings.value[provider] && provider !== 'google'
            ])
          )
        : {}
    )
  },
  { deep: true, immediate: true }
)

fontManager.setWebFontFetch(browserWebFontFetch)

export interface ListedFontFamily {
  family: string
  styles: string[]
}

export function preloadFonts(): void {
  if (onlineFontsEnabled.value) fontManager.preloadWebFontFamilies()
}

export function localFontAccessState(): LocalFontAccessState {
  return fontManager.localAccessState()
}

export async function requestLocalFontAccess(): Promise<FontFamilyOption[]> {
  await fontManager.requestLocalFontAccess()
  return listFamilies()
}

export async function downloadedFontCacheSummary() {
  return { count: 0, byteLength: 0, updatedAt: null }
}

export async function clearDownloadedFontCache(): Promise<void> {}

export async function predownloadFallbackFonts() {
  return fontManager.ensureFallbackPack()
}

export async function listFamilies(): Promise<FontFamilyOption[]> {
  return fontManager.listFamilyOptions()
}

export async function listFonts(): Promise<ListedFontFamily[]> {
  return []
}

interface FontRenderInvalidator {
  invalidateAllPictures(): void
}

export async function ensureGraphFonts(
  graph: SceneGraph,
  nodeIds: string[],
  renderer?: FontRenderInvalidator | null
): Promise<boolean> {
  fontManager.blockNodesUntilFontsResolve(nodeIds)
  try {
    const generationBefore = fontManager.generation()
    const fontKeys = fontManager.collectFontKeys(graph, nodeIds)
    const requirements = collectGraphFontRequirements(graph, nodeIds)
    const { characters } = requirements
    await Promise.all(fontKeys.map(([family, style]) => loadFont(family, style, characters)))
    const fallbackScripts = missingGraphFontScripts(requirements, {
      treatUnknownCoverageAsMissing: false
    })
    if (fallbackScripts.length > 0) {
      const fallbacks = await fontManager.ensureFallbackPack(fallbackScripts, characters)
      if (Object.values(fallbacks).some((families) => families.length > 0)) {
        clearTextPictures(graph, nodeIds)
      }
    } else if (fontManager.generation() !== generationBefore) {
      clearTextPictures(graph, nodeIds)
    }
    return fontManager.generation() !== generationBefore || fallbackScripts.length > 0
  } finally {
    fontManager.unblockNodes(nodeIds)
    renderer?.invalidateAllPictures()
  }
}

function clearTextPictures(graph: SceneGraph, nodeIds: string[]): void {
  const clear = (id: string) => {
    const node = graph.getNode(id)
    if (!node) return
    if (node.type === 'TEXT') node.textPicture = null
    for (const childId of node.childIds) clear(childId)
  }
  for (const id of nodeIds) clear(id)
}

export async function loadFont(
  family: string,
  style = 'Regular',
  characters = '',
  signal?: AbortSignal
): Promise<ArrayBuffer | null> {
  return fontManager.loadFont(family, style, characters, signal)
}
