import type { DocumentStore } from '@open-pencil/engine'
import type { JSONValue } from '@open-pencil/session'

import { readNode, writeField } from './commands'
import { failed, UNSUPPORTED_SCRIPT, type ToolOutcome } from './outcome'
import type { AutomationScope } from './scope'

const NUMBER_LITERAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/

interface Cursor<T> {
  readonly value: T
  readonly index: number
}

type ScriptCall =
  | { readonly kind: 'getNode'; readonly id: string }
  | {
      readonly kind: 'setField'
      readonly id: string
      readonly field: string
      readonly value: JSONValue
    }

interface ParsedCall {
  readonly call: ScriptCall
  readonly index: number
}

/**
 * The openpencil global a script can call. It is not installed on globalThis,
 * and there is no figma global. The source is never passed to eval or Function.
 */
interface OpenPencilGlobal {
  getNode(id: string): ToolOutcome
  setField(id: string, field: string, value: JSONValue): ToolOutcome
}

export function runScript(
  store: DocumentStore,
  scope: AutomationScope,
  source: string
): ToolOutcome {
  const calls = parseCalls(source)
  if (!calls) return failed(UNSUPPORTED_SCRIPT)
  const openpencil = createOpenPencil(store, scope)
  let outcome: ToolOutcome = { ok: true }
  for (const call of calls) {
    outcome =
      call.kind === 'getNode'
        ? openpencil.getNode(call.id)
        : openpencil.setField(call.id, call.field, call.value)
    if (!outcome.ok) return outcome
  }
  return outcome
}

function createOpenPencil(store: DocumentStore, scope: AutomationScope): OpenPencilGlobal {
  return {
    getNode(id) {
      return readNode(store, scope, id)
    },
    setField(id, field, value) {
      return writeField(store, scope, id, field, value)
    }
  }
}

function parseCalls(source: string): ScriptCall[] | null {
  const calls: ScriptCall[] = []
  let index = skipSpace(source, 0)
  while (index < source.length) {
    if (source.charAt(index) === ';') {
      index = skipSpace(source, index + 1)
      continue
    }
    const parsed = parseCall(source, index)
    if (!parsed) return null
    calls.push(parsed.call)
    index = skipSpace(source, parsed.index)
  }
  return calls
}

function parseCall(source: string, index: number): ParsedCall | null {
  const getAt = openCall(source, index, 'getNode')
  if (getAt !== null) return parseGet(source, getAt)
  const setAt = openCall(source, index, 'setField')
  if (setAt !== null) return parseSet(source, setAt)
  return null
}

function openCall(source: string, index: number, name: 'getNode' | 'setField'): number | null {
  const head = expectWord(source, index, 'openpencil.')
  if (head === null) return null
  const member = expectWord(source, head, name)
  if (member === null) return null
  return expectChar(source, member, '(')
}

function parseGet(source: string, start: number): ParsedCall | null {
  const id = readString(source, skipSpace(source, start))
  if (!id) return null
  const end = expectChar(source, id.index, ')')
  if (end === null) return null
  return { call: { kind: 'getNode', id: id.value }, index: end }
}

function parseSet(source: string, start: number): ParsedCall | null {
  const id = readString(source, skipSpace(source, start))
  if (!id) return null
  const afterId = expectChar(source, id.index, ',')
  if (afterId === null) return null
  const field = readString(source, skipSpace(source, afterId))
  if (!field) return null
  const afterField = expectChar(source, field.index, ',')
  if (afterField === null) return null
  const value = readValue(source, skipSpace(source, afterField))
  if (!value) return null
  const end = expectChar(source, value.index, ')')
  if (end === null) return null
  return {
    call: { kind: 'setField', id: id.value, field: field.value, value: value.value },
    index: end
  }
}

function readValue(source: string, start: number): Cursor<JSONValue> | null {
  const keyword = readKeyword(source, start)
  if (keyword) return keyword
  const text = readString(source, start)
  if (text) return text
  return readNumber(source, start)
}

function readKeyword(source: string, index: number): Cursor<JSONValue> | null {
  const endTrue = expectWord(source, index, 'true')
  if (endTrue !== null) return { value: true, index: endTrue }
  const endFalse = expectWord(source, index, 'false')
  if (endFalse !== null) return { value: false, index: endFalse }
  const endNull = expectWord(source, index, 'null')
  if (endNull !== null) return { value: null, index: endNull }
  return null
}

function readNumber(source: string, index: number): Cursor<number> | null {
  const match = NUMBER_LITERAL.exec(source.slice(index))
  if (match === null) return null
  const token = match[0]
  const value = Number(token)
  if (!Number.isFinite(value)) return null
  return { value, index: index + token.length }
}

function readString(source: string, start: number): Cursor<string> | null {
  const quote = source.charAt(start)
  if (quote !== '"' && quote !== "'") return null
  let value = ''
  let index = start + 1
  while (index < source.length) {
    const char = source.charAt(index)
    if (char === quote) return { value, index: index + 1 }
    if (char === '\\') {
      const next = escaped(source.charAt(index + 1))
      if (next === null) return null
      value += next
      index += 2
      continue
    }
    if (char === '\n' || char === '\r') return null
    value += char
    index += 1
  }
  return null
}

function escaped(char: string): string | null {
  if (char === 'n') return '\n'
  if (char === 't') return '\t'
  if (char === 'r') return '\r'
  if (char === '\\' || char === '"' || char === "'") return char
  return null
}

function expectWord(source: string, index: number, word: string): number | null {
  if (!source.startsWith(word, index)) return null
  const end = index + word.length
  const last = word.charAt(word.length - 1)
  if (isIdent(last) && end < source.length && isIdent(source.charAt(end))) return null
  return end
}

function expectChar(source: string, index: number, char: string): number | null {
  const cursor = skipSpace(source, index)
  if (source.charAt(cursor) !== char) return null
  return cursor + 1
}

function skipSpace(source: string, index: number): number {
  let cursor = index
  while (cursor < source.length) {
    const char = source.charAt(cursor)
    if (char !== ' ' && char !== '\n' && char !== '\t' && char !== '\r') return cursor
    cursor += 1
  }
  return cursor
}

function isIdent(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char)
}
