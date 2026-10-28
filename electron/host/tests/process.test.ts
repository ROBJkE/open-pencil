import { describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createDocumentProcessHost } from '#host/document/host'
import { parseDocumentResult } from '#host/document/protocol'
import { createLocalDocumentRuntime } from '#host/document/runtime'
import { createUtilitySupervisor } from '#host/document/supervisor'
import { isAllowedExternalURL, launchTargets, parseDeepLink } from '#host/main/links'
import { editorMenu } from '#host/main/menu-model'
import { decideRestart } from '#host/main/restart'
import { createSecretStore, type SecretCipher } from '#host/main/secrets'
import { ownedToolLaunch } from '#host/main/tools'

import { createElectronHost } from '@open-pencil/electron'
import { createDocumentEngine, createPenCodec } from '@open-pencil/engine'

const frame = {
  type: 'create' as const,
  parentId: null,
  index: 0,
  node: { id: 'frame', type: 'frame', fields: { name: 'Frame' } }
}

describe('electron host', () => {
  test('in-process host still opens a document', async () => {
    const host = createElectronHost()
    const id = await host.openDocument({ name: 'Empty', id: 'empty' })
    expect(id).toBe('empty')
    expect(host.kind).toBe('electron')
    const ack = await host.session.client.submit(id, frame)
    expect(ack.accepted).toBe(true)
    const tree = await host.session.client.layerTree(id, { parentId: null, offset: 0, limit: 10 })
    expect(tree.rows.map((row) => row.name)).toEqual(['Frame'])
  })

  test('caps document processes and restarts a killed one from its checkpoint', async () => {
    let spawns = 0
    const windowClosed = false
    const supervisor = createUtilitySupervisor({
      cpuCount: 2,
      factory: {
        spawn() {
          spawns += 1
          return createLocalDocumentRuntime()
        }
      }
    })
    const first = await supervisor.open({ name: 'one', id: 'one' })
    const second = await supervisor.open({ name: 'two', id: 'two' })
    expect(supervisor.documentCap).toBe(2)
    expect(spawns).toBe(2)
    await supervisor.submit(first, frame, 'interaction')
    await supervisor.submit(
      second,
      {
        type: 'create',
        parentId: null,
        index: 0,
        node: { id: 'other', type: 'frame', fields: { name: 'Other' } }
      },
      'interaction'
    )
    expect(
      (await supervisor.layerTree(first, { parentId: null, offset: 0, limit: 10 })).rows.map(
        (row) => row.name
      )
    ).toEqual(['Frame'])
    expect(
      (await supervisor.layerTree(second, { parentId: null, offset: 0, limit: 10 })).rows.map(
        (row) => row.name
      )
    ).toEqual(['Other'])

    let thirdOpened = false
    const third = supervisor.open({ name: 'three', id: 'three' }).then((id) => {
      thirdOpened = true
      return id
    })
    await Promise.resolve()
    expect(thirdOpened).toBe(false)

    const events: string[] = []
    supervisor.subscribe(first, (event) => {
      events.push(event.type)
    })
    await supervisor.crash(first)
    expect(windowClosed).toBe(false)
    expect(spawns).toBe(3)
    expect(events).toEqual(['crashed', 'recovered'])
    expect(thirdOpened).toBe(false)
    expect(
      (await supervisor.layerTree(first, { parentId: null, offset: 0, limit: 10 })).rows.map(
        (row) => row.name
      )
    ).toEqual(['Frame'])
    expect(
      (await supervisor.layerTree(second, { parentId: null, offset: 0, limit: 10 })).rows.map(
        (row) => row.name
      )
    ).toEqual(['Other'])

    await supervisor.close(second)
    await third
    expect(thirdOpened).toBe(true)
    expect(spawns).toBe(4)
    await supervisor.shutdown()
  })

  test('round-trips .pen bytes through the document protocol', async () => {
    const codec = createPenCodec()
    const source = createDocumentEngine({ name: 'Disk', id: 'disk' })
    source.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: { id: 'frame', type: 'frame', fields: { name: 'Saved' } }
    })
    const bytes = codec.write(source.checkpoint())
    source.dispose()

    const supervisor = createUtilitySupervisor({
      factory: { spawn: () => createLocalDocumentRuntime() }
    })
    const id = await supervisor.open({ name: 'Disk', id: 'disk', bytes })
    const tree = await supervisor.layerTree(id, { parentId: null, offset: 0, limit: 10 })
    expect(tree.rows.map((row) => row.name)).toEqual(['Saved'])
    const exported = await supervisor.exportBytes(id)
    const restored = createDocumentEngine({ name: 'Again', id: 'again', bytes: exported })
    expect(
      restored.readLayerTree({ parentId: null, offset: 0, limit: 10 }).rows.map((row) => row.name)
    ).toEqual(['Saved'])
    restored.dispose()
    await supervisor.shutdown()
  })

  test('rejects inbound JSON that does not match the session schema', () => {
    const host = createDocumentProcessHost()
    const invalid = host.handle('{')[0]
    const parsed = parseDocumentResult(invalid)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.output.ok).toBe(false)

    const rejected = host.handle(
      JSON.stringify({ type: 'apply', requestId: '1', command: { type: 'nope' } })
    )[0]
    const badCommand = parseDocumentResult(rejected)
    expect(badCommand.success).toBe(true)
    if (badCommand.success) {
      expect(badCommand.output.ok).toBe(false)
      expect(badCommand.output.reason).toBe('invalid-message')
    }
    host.dispose()
  })
})

describe('shell policies', () => {
  test('opens only http, https, and mailto links', () => {
    expect(isAllowedExternalURL('https://cloud.example.com/auth')).toBe(true)
    expect(isAllowedExternalURL('http://192.168.1.20:3000/account')).toBe(true)
    expect(isAllowedExternalURL('mailto:team@example.com')).toBe(true)
    expect(isAllowedExternalURL('file:///etc/passwd')).toBe(false)
    expect(isAllowedExternalURL('openpencil://open?file=a.pen')).toBe(false)
    expect(isAllowedExternalURL('data:text/html,hello')).toBe(false)
  })

  test('parses openpencil links and launch arguments', () => {
    expect(parseDeepLink('openpencil://open?file=web%2Fdesign.pen&node=Button')).toEqual({
      type: 'open',
      file: 'web/design.pen',
      node: 'Button'
    })
    expect(parseDeepLink('openpencil://open?file=%2FUsers%2Fx%2Fa.pen')).toBeNull()
    expect(parseDeepLink('openpencil://join?room=abcdefghijklmnopqrstuvwxyz012345')).toEqual({
      type: 'join',
      room: 'abcdefghijklmnopqrstuvwxyz012345'
    })
    expect(parseDeepLink('openpencil://export?file=a.pen')).toBeNull()
    expect(launchTargets(['--', 'notes.pen', 'openpencil://open?file=a.pen', 'board.fig'])).toEqual(
      {
        pens: ['notes.pen'],
        figs: ['board.fig'],
        links: ['openpencil://open?file=a.pen']
      }
    )
  })

  test('keeps the chat shortcut beside developer tools', () => {
    const view = editorMenu({ platform: 'linux' }).find((group) => group.label === 'View')
    const chat = view?.items.find((item) => item.id === 'toggle-ai')
    const tools = view?.items.find((item) => item.id === 'dev-tools')
    expect(chat).toEqual({ id: 'toggle-ai', label: 'Toggle Chat', accelerator: 'CmdOrCtrl+J' })
    expect(tools?.label).toBe('Developer Tools')
    const file = editorMenu({ platform: 'linux' }).find((group) => group.label === 'File')
    expect(file?.items.some((item) => item.id === 'autosave')).toBe(false)
    expect(
      file?.items.some((item) => item.id === 'quit' && item.accelerator === 'CmdOrCtrl+Q')
    ).toBe(true)
  })

  test('asks the editor to finish or cancel saves before restart', async () => {
    let asked = false
    const clean = await decideRestart({
      dirty: false,
      askEditor: async () => {
        asked = true
        return 'cancel'
      },
      askNative: async () => 'cancel'
    })
    expect(clean).toBe('finish')
    expect(asked).toBe(false)
    const cancelled = await decideRestart({
      dirty: true,
      askEditor: async () => 'cancel',
      askNative: async () => 'finish'
    })
    expect(cancelled).toBe('cancel')
    const native = await decideRestart({
      dirty: true,
      askEditor: async () => 'timeout',
      askNative: async () => 'finish'
    })
    expect(native).toBe('finish')
  })

  test('refuses to store a secret when encryption is unavailable', async () => {
    let writes = 0
    const store = createSecretStore(cipher(false), {
      read: async () => ({}),
      write: async () => {
        writes += 1
      }
    })
    const result = await store.write('openai', 'sk-test')
    expect(result).toEqual({ ok: false, error: 'encryption-unavailable' })
    expect(writes).toBe(0)
  })

  test('stores ciphertext and never the secret itself', async () => {
    const saved = { entries: {} as Record<string, string> }
    const secrets = new Map<string, string>()
    const store = createSecretStore(
      {
        available: async () => true,
        async encrypt(plain) {
          const token = `cipher-${secrets.size + 1}`
          secrets.set(token, plain)
          return new TextEncoder().encode(token)
        },
        async decrypt(bytes) {
          const token = new TextDecoder().decode(bytes)
          const secret = secrets.get(token)
          if (!secret) throw new Error('locked')
          return { secret, reencrypt: false }
        }
      },
      {
        read: async () => ({ ...saved.entries }),
        write: async (data) => {
          saved.entries = { ...data }
        }
      }
    )
    expect(await store.write('openai', 'sk-test')).toEqual({ ok: true })
    expect(JSON.stringify(saved.entries)).not.toContain('sk-test')
    expect(await store.read('openai')).toEqual({ ok: true, value: 'sk-test' })
    expect(await store.read('missing')).toEqual({ ok: true, value: null })
  })

  test('launches our tools with Electron as Node', () => {
    const launch = ownedToolLaunch(
      'cli.js',
      ['--help'],
      '/Applications/OpenPencil.app/Contents/MacOS/OpenPencil'
    )
    expect(launch.command).toBe('/Applications/OpenPencil.app/Contents/MacOS/OpenPencil')
    expect(launch.args).toEqual(['cli.js', '--help'])
    expect(launch.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
    expect(launch.command.endsWith('node')).toBe(false)
  })
})

function cipher(available: boolean): SecretCipher {
  return {
    available: async () => available,
    encrypt: async () => new Uint8Array([1]),
    decrypt: async () => ({ secret: '', reencrypt: false })
  }
}

describe('utility process', () => {
  test('restarts a real utility process when Electron can start headlessly', async () => {
    const outcome = await runElectronSmoke()
    if (outcome === 'unavailable') return
    expect(outcome).toBe(0)
  }, 60_000)
})

async function runElectronSmoke(): Promise<number | 'unavailable'> {
  const electron = join(import.meta.dir, '../node_modules/electron/dist/electron')
  if (!existsSync(electron) || !existsSync('/usr/bin/xvfb-run')) return 'unavailable'
  const host = join(import.meta.dir, '..')
  const build = await run(
    process.execPath,
    [
      'build',
      'src/main/index.ts',
      '--outfile=dist/main.js',
      '--target=node',
      '--external',
      'electron',
      '--external',
      'electron-updater'
    ],
    host
  )
  if (build.code !== 0) return build.code ?? 1
  const worker = await run(
    process.execPath,
    [
      'build',
      'src/document/worker.ts',
      '--outfile=dist/worker.cjs',
      '--target=node',
      '--format=cjs'
    ],
    host
  )
  if (worker.code !== 0) return worker.code ?? 1
  const data = mkdtempSync(join(tmpdir(), 'openpencil-smoke-'))
  const smoke = await run(
    '/usr/bin/xvfb-run',
    ['-a', electron, 'dist/main.js', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    host,
    {
      OPENPENCIL_DOCUMENT_SMOKE: '1',
      OPENPENCIL_SMOKE_DATA: data,
      ELECTRON_DISABLE_SANDBOX: '1'
    }
  )
  const output = `${smoke.stdout}\n${smoke.stderr}`
  if (/Missing X server|cannot open display|Failed to connect/i.test(output) && smoke.code !== 0) {
    return 'unavailable'
  }
  return smoke.code ?? 1
}

function chunkText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk)
  return ''
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {}
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: unknown) => {
      stdout += chunkText(chunk)
    })
    child.stderr.on('data', (chunk: unknown) => {
      stderr += chunkText(chunk)
    })
    child.on('error', () => {
      resolvePromise({ code: null, stdout, stderr })
    })
    child.on('close', (code) => {
      resolvePromise({ code, stdout, stderr })
    })
  })
}
