import type { FontFace, GraphNode } from '@open-pencil/session'

/** Width and height of laid-out text, in pixels. */
export interface TextSize {
  readonly width: number
  readonly height: number
}

/** `paragraph` is CanvasKit. `fallback` is the deterministic size used when it cannot measure. */
export type TextMeasurePath = 'paragraph' | 'fallback'

export interface TextMeasurement extends TextSize {
  readonly path: TextMeasurePath
}

/** A text node whose family is not in the font catalog. */
export interface MissingFont {
  readonly nodeId: string
  readonly family: string
}

/** Measures one node. An edit passes this so only that node is shaped. */
export type TextMeasure = (node: GraphNode, font: FontFace) => Promise<TextMeasurement>

export interface TextEditOptions {
  readonly font?: FontFace
  readonly measure?: TextMeasure
}

export interface TextEditResult {
  readonly accepted: boolean
  readonly width: number
  readonly height: number
  readonly path: TextMeasurePath
  readonly measuredIds: readonly string[]
}
