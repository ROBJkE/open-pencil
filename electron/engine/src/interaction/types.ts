/** A canvas point. Draw gestures are in the parent's axes; zoom anchors are screen pixels. */
export interface Point {
  readonly x: number
  readonly y: number
}

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** The numbers a viewport command carries. Page is not part of the command. */
export interface Viewport {
  readonly zoom: number
  readonly panX: number
  readonly panY: number
  readonly width: number
  readonly height: number
}

/** An edge the pointer landed on. `position` is the x of a vertical edge or the y of a horizontal one. */
export interface SnapGuide {
  readonly axis: 'x' | 'y'
  readonly position: number
  readonly id: string
}

export interface SnapResult {
  readonly point: Point
  readonly dx: number
  readonly dy: number
  readonly guides: readonly SnapGuide[]
}

/**
 * `preview` patches geometry and is not an undo step.
 * `commit` stores that preview as one undo step.
 * `cancel` drops it.
 * A draw's `commit` is the exception: it creates one node, which is itself one undo step.
 */
export type GesturePhase = 'preview' | 'commit' | 'cancel'

/** Hover never becomes a command. The id comes from `hitTest` on the local index. */
export interface HoverGesture {
  readonly kind: 'hover'
  readonly point: Point
}

/**
 * `hitId` is the id `hitTest` already resolved. The command does not look at the document.
 * `additive` toggles `hitId` in `selection` (shift-click).
 */
export interface ClickGesture {
  readonly kind: 'click'
  readonly point: Point
  readonly hitId: string | null
  readonly selection: readonly string[]
  readonly additive?: boolean
}

/** Marquee ids come from `hitsInRect` on the local index. Only `commit` changes the selection. */
export interface MarqueeGesture {
  readonly kind: 'marquee'
  readonly phase: GesturePhase
  readonly hits: readonly string[]
  readonly selection: readonly string[]
  readonly additive?: boolean
}

/**
 * A press-drag that creates a node when it commits.
 * `constrain` keeps a box square and snaps a line to 45° steps.
 * `viewport` is only read by the zoom tool, which fits the drag in the view.
 */
export interface DrawGesture {
  readonly kind: 'draw'
  readonly phase: GesturePhase
  readonly id: string
  readonly parentId: string | null
  readonly index: number
  readonly from: Point
  readonly to: Point
  readonly constrain?: boolean
  readonly viewport?: Viewport
}

/** Where a node sits before a move. Several origins travel in one preview. */
export interface MoveOrigin {
  readonly id: string
  readonly x: number
  readonly y: number
}

export interface MoveGesture {
  readonly kind: 'move'
  readonly phase: GesturePhase
  readonly origins: readonly MoveOrigin[]
  readonly dx: number
  readonly dy: number
}

export interface ResizeGesture {
  readonly kind: 'resize'
  readonly phase: GesturePhase
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface RotateGesture {
  readonly kind: 'rotate'
  readonly phase: GesturePhase
  readonly id: string
  readonly rotation: number
}

/**
 * Pen points in canvas space. Fewer than two points commit nothing.
 * `editing` means the path is already in the document, so commit stores the preview.
 */
export interface PenGesture {
  readonly kind: 'pen'
  readonly phase: GesturePhase
  readonly id: string
  readonly parentId: string | null
  readonly index: number
  readonly points: readonly Point[]
  readonly closed?: boolean
  readonly editing?: boolean
}

export interface PanGesture {
  readonly kind: 'pan'
  readonly dx: number
  readonly dy: number
  readonly viewport: Viewport
}

/** `anchor` is the screen point that stays fixed. `factor` above 1 zooms in. */
export interface ZoomGesture {
  readonly kind: 'zoom'
  readonly factor: number
  readonly anchor: Point
  readonly viewport: Viewport
}

export type Gesture =
  | HoverGesture
  | ClickGesture
  | MarqueeGesture
  | DrawGesture
  | MoveGesture
  | ResizeGesture
  | RotateGesture
  | PenGesture
  | PanGesture
  | ZoomGesture
