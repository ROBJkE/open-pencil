import type {
  ApplyResult,
  BoundsEntry,
  Checkpoint,
  Command,
  LayerTreeQuery,
  LayerTreeWindow,
  OpenDocumentSpec,
  SelectionProperties,
  ViewportSummary
} from './schema'

/**
 * In-process document API. The utility process hosts one of these per file.
 * The Vue window never receives this object.
 */
export interface DocumentEngine {
  readonly id: string
  readonly name: string
  apply(command: Command): ApplyResult
  readLayerTree(query: LayerTreeQuery): LayerTreeWindow
  readSelection(): SelectionProperties
  readViewport(): ViewportSummary
  readSpatialIndex(): BoundsEntry[]
  checkpoint(): Checkpoint
  restore(checkpoint: Checkpoint): void
  dispose(): void
}

export interface EngineFactory {
  open(spec: OpenDocumentSpec): DocumentEngine
}
