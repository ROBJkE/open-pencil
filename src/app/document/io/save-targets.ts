import { pickBrowserSaveFile } from '@/app/document/io/capability'

export async function chooseBrowserFigSaveHandle() {
  try {
    return await pickBrowserSaveFile({
      suggestedName: 'Untitled.fig',
      types: [
        {
          description: 'Figma file',
          accept: { 'application/octet-stream': ['.fig'] }
        }
      ]
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') return null
    throw error
  }
}
