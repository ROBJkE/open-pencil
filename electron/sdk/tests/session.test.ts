import { describe, expect, test } from 'bun:test'

import { SESSION_KEY } from '@open-pencil/vue-next'

describe('vue session', () => {
  test('exposes an injection key for the session client', () => {
    expect(typeof SESSION_KEY).toBe('symbol')
  })
})
