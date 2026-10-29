import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'
import { type Component } from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'

const cacheDir = '/tmp/openpencil-vue-sdk'
const compiling = new Map<string, Promise<string>>()

function slug(file: string): string {
  let hash = 2166136261
  for (const char of file) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `vue-${(hash >>> 0).toString(16)}`
}

function stripTypeImports(code: string): string {
  return code
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('import type '))
    .join('\n')
}

function specifiersIn(code: string): string[] {
  const found: string[] = []
  for (const match of code.matchAll(/from\s+(['"])([^'"]+)\1/g)) {
    const specifier = match[2]
    if (specifier && !found.includes(specifier)) found.push(specifier)
  }
  return found
}

function rewriteImports(code: string, resolved: ReadonlyMap<string, string>): string {
  return code.replaceAll(
    /from\s+(['"])([^'"]+)\1/g,
    (_match, _quote: string, specifier: string) => {
      const href = resolved.get(specifier)
      if (!href) throw new Error(`Unresolved Vue import ${specifier}`)
      return `from ${JSON.stringify(href)}`
    }
  )
}

async function resolveSpecifier(fromFile: string, specifier: string): Promise<string> {
  if (specifier.endsWith('.vue')) return compileVueFile(resolve(dirname(fromFile), specifier))
  const resolved = Bun.resolveSync(specifier, dirname(fromFile))
  if (resolved.endsWith('.vue')) return compileVueFile(resolved)
  return pathToFileURL(resolved).href
}

async function writeCompiled(file: string): Promise<string> {
  const source = readFileSync(file, 'utf8')
  const parsed = parse(source, { filename: file })
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message)
  if (!parsed.descriptor.template) throw new Error(`Missing template in ${file}`)
  const script = compileScript(parsed.descriptor, { id: slug(file), inlineTemplate: true })
  const javascript = stripTypeImports(
    ts.transpileModule(script.content, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext
      },
      fileName: `${file}.ts`
    }).outputText
  )
  const resolved = new Map<string, string>()
  for (const specifier of specifiersIn(javascript)) {
    resolved.set(specifier, await resolveSpecifier(file, specifier))
  }
  mkdirSync(cacheDir, { recursive: true })
  const output = resolve(cacheDir, `${slug(file)}.mjs`)
  writeFileSync(output, rewriteImports(javascript, resolved))
  return pathToFileURL(output).href
}

function compileVueFile(file: string): Promise<string> {
  const existing = compiling.get(file)
  if (existing) return existing
  const pending = writeCompiled(file)
  compiling.set(file, pending)
  return pending
}

function readDefault(loaded: unknown): unknown {
  if (typeof loaded !== 'object' || loaded === null || !('default' in loaded)) return undefined
  return loaded.default
}

function isComponent(value: unknown): value is Component {
  if (typeof value === 'function') return true
  return typeof value === 'object' && value !== null && ('setup' in value || 'render' in value)
}

export async function loadVueFile(file: string): Promise<Component> {
  const href = await compileVueFile(resolve(file))
  const component = readDefault(await import(href))
  if (!isComponent(component)) throw new Error(`Vue file did not export a component: ${file}`)
  return component
}
