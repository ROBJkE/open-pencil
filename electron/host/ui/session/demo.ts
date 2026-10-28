import type { LayerRow, ReplayProjection, SelectionProperties } from '@open-pencil/session'

/** Pages sit in front of the active page's layers so each panel can window one list. */
export const PAGE_COUNT = 16
export const LAYER_COUNT = 400

const SELECTED_LAYER = 4

function pageRow(index: number): LayerRow {
  return {
    id: `page-${index}`,
    name: `Page ${index + 1}`,
    type: 'page',
    depth: 0,
    childCount: 0,
    expanded: true,
    selected: false,
    visible: true
  }
}

function layerRow(index: number): LayerRow {
  const frame = index % 5 === 0
  return {
    id: `layer-${index}`,
    name: frame ? `Frame ${index}` : `Rectangle ${index}`,
    type: frame ? 'frame' : 'rectangle',
    depth: frame ? 0 : 1,
    childCount: frame ? 4 : 0,
    expanded: frame,
    selected: index === SELECTED_LAYER,
    visible: index !== 7
  }
}

const selectionFields: SelectionProperties['fields'] = {
  name: 'Rectangle 4',
  type: 'rectangle',
  x: 32,
  y: 48,
  width: 160,
  height: 96,
  rotation: 0,
  opacity: 100,
  fontSize: 16,
  fontFamily: 'Inter',
  strokeWidth: 1,
  fill: 'Solid',
  stroke: 'Solid',
  gap: 8,
  padding: 0
}

export function demoProjection(): ReplayProjection {
  const rows = [
    ...Array.from({ length: PAGE_COUNT }, (_, index) => pageRow(index)),
    ...Array.from({ length: LAYER_COUNT }, (_, index) => layerRow(index))
  ]
  return {
    layerTree: {
      parentId: null,
      offset: 0,
      limit: rows.length,
      rows,
      total: rows.length
    },
    selection: { ids: [`layer-${SELECTED_LAYER}`], fields: selectionFields, mixed: [] },
    viewport: { pageId: 'page-0', zoom: 1, panX: 0, panY: 0, width: 1440, height: 900 }
  }
}
