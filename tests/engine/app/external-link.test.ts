import { describe, test, expect, vi, beforeEach, afterEach } from 'bun:test'

import { openExternalLink } from '@/app/shell/ui'

describe('openExternalLink', () => {
  let mockOpen: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOpen = vi.fn().mockReturnValue(null)
    Reflect.defineProperty(globalThis, 'window', {
      value: { open: mockOpen },
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
    vi.restoreAllMocks()
  })

  test('calls window.open with _blank target for OpenRouter key URL', async () => {
    await openExternalLink('https://openrouter.ai/keys')

    expect(mockOpen).toHaveBeenCalledWith('https://openrouter.ai/keys', '_blank')
  })

  test('calls window.open with _blank target for Anthropic key URL', async () => {
    await openExternalLink('https://console.anthropic.com/settings/keys')

    expect(mockOpen).toHaveBeenCalledWith('https://console.anthropic.com/settings/keys', '_blank')
  })

  test('passes arbitrary URL unchanged', async () => {
    await openExternalLink('https://example.com/docs')

    expect(mockOpen).toHaveBeenCalledWith('https://example.com/docs', '_blank')
  })
})
