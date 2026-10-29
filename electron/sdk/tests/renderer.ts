import {
  HTMLElement as DomHTMLElement,
  type DocumentFragment as DomFragment,
  type Node as DomNode,
  type TEventListener
} from 'happy-dom'
import { createRenderer } from 'vue'

import { domDocument } from './dom'

function cssProperty(name: string): string {
  return name.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)
}

function isListener(value: unknown): value is TEventListener {
  return typeof value === 'function'
}

function listeners(value: unknown): TEventListener[] {
  if (isListener(value)) return [value]
  if (!Array.isArray(value)) return []
  return value.filter(isListener)
}

function isEventKey(key: string): boolean {
  if (!key.startsWith('on') || key.length < 3) return false
  const third = key.charAt(2)
  return third !== third.toLowerCase()
}

function setStyle(element: DomHTMLElement, value: unknown): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return
  const style = element.style
  for (const [name, property] of Object.entries(value)) {
    if (property === null || property === undefined) continue
    if (typeof property === 'string' || typeof property === 'number') {
      style.setProperty(cssProperty(name), String(property))
    }
  }
}

function setControlValue(element: DomHTMLElement, key: string, value: unknown): boolean {
  if (key !== 'value' && key !== 'checked') return false
  const tag = element.tagName.toUpperCase()
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false
  Reflect.set(element, key, value)
  return true
}

function patchProp(element: DomHTMLElement, key: string, prev: unknown, next: unknown): void {
  if (isEventKey(key)) {
    const name = key.slice(2).toLowerCase()
    for (const listener of listeners(prev)) element.removeEventListener(name, listener)
    for (const listener of listeners(next)) element.addEventListener(name, listener)
    return
  }
  if (key === 'style') {
    setStyle(element, next)
    return
  }
  if (key === 'class') {
    element.setAttribute('class', typeof next === 'string' ? next : '')
    return
  }
  if (setControlValue(element, key, next)) return
  if (next === null || next === undefined || next === false) {
    element.removeAttribute(key)
    return
  }
  if (typeof next === 'string' || typeof next === 'number' || next === true) {
    element.setAttribute(key, next === true ? 'true' : String(next))
  }
}

function hasBefore(node: DomNode): node is DomNode & { before(child: DomNode): void } {
  return 'before' in node && typeof node.before === 'function'
}

function place(parent: DomHTMLElement, child: DomNode, anchor?: DomNode | null): void {
  if (anchor && hasBefore(anchor)) {
    anchor.before(child)
    return
  }
  parent.append(child)
}

function isFragment(value: unknown): value is DomFragment {
  return (
    typeof value === 'object' && value !== null && 'firstChild' in value && 'lastChild' in value
  )
}

function templateFragment(content: string): DomFragment | null {
  const template = domDocument.createElement('template')
  template.innerHTML = content
  if (!('content' in template) || !isFragment(template.content)) return null
  return template.content
}

function insertStaticContent(
  content: string,
  parent: DomHTMLElement,
  anchor: DomNode | null
): [DomNode, DomNode] {
  const fragment = templateFragment(content)
  const first = fragment?.firstChild ?? null
  const last = fragment?.lastChild ?? null
  if (!fragment || !first || !last) {
    const comment = domDocument.createComment('')
    place(parent, comment, anchor)
    return [comment, comment]
  }
  place(parent, fragment, anchor)
  return [first, last]
}

export const domRenderer = createRenderer<DomNode, DomHTMLElement>({
  patchProp,
  insert(child, parent, anchor) {
    place(parent, child, anchor)
  },
  remove(child) {
    const parent = child.parentNode
    if (parent) parent.removeChild(child)
  },
  createElement(tag) {
    return domDocument.createElement(tag)
  },
  createText(text) {
    return domDocument.createTextNode(text)
  },
  createComment(text) {
    return domDocument.createComment(text)
  },
  setText(node, text) {
    node.nodeValue = text
  },
  setElementText(element, text) {
    element.textContent = text
  },
  parentNode(node) {
    const parent = node.parentNode
    return parent instanceof DomHTMLElement ? parent : null
  },
  nextSibling(node) {
    return node.nextSibling
  },
  querySelector(selector) {
    const found = domDocument.querySelector(selector)
    return found instanceof DomHTMLElement ? found : null
  },
  setScopeId(element, id) {
    element.setAttribute(id, '')
  },
  insertStaticContent
})
