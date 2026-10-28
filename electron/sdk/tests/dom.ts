import { Window } from 'happy-dom'

const dom = new Window({
  url: 'https://open-pencil.localhost/',
  width: 1280,
  height: 800
})

function install(name: string, value: unknown): void {
  Reflect.set(globalThis, name, value)
}

install('window', dom)
install('document', dom.document)
install('HTMLElement', dom.HTMLElement)
install('HTMLInputElement', dom.HTMLInputElement)
install('Element', dom.Element)
install('Node', dom.Node)
install('SVGElement', dom.SVGElement)
install('Document', dom.Document)
install('MutationObserver', dom.MutationObserver)
install('PointerEvent', dom.PointerEvent)
install('MouseEvent', dom.MouseEvent)
install('Event', dom.Event)
install('navigator', dom.navigator)
install('getComputedStyle', dom.getComputedStyle.bind(dom))
install('requestAnimationFrame', dom.requestAnimationFrame.bind(dom))
install('cancelAnimationFrame', dom.cancelAnimationFrame.bind(dom))

export const domWindow = dom
export const domDocument = dom.document
