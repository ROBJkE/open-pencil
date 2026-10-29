/** A node's box after layout. Coordinates are local to the parent, as the graph stores them. */
export interface LayoutBox {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Boxes for the nodes a pass recomputed, plus how many nodes that pass walked. */
export interface LayoutResult {
  readonly boxes: readonly LayoutBox[]
  readonly recomputed: number
}
