/**
 * Tool names copied from `packages/core/src/tools/registry` (`CORE_TOOLS`, then
 * `EXTENDED_TOOLS`). Stored once so this package does not import the Figma API.
 */
export const TOOL_NAMES = [
  'get_selection',
  'get_node',
  'find_nodes',
  'get_jsx',
  'render',
  'update_node',
  'set_layout',
  'set_layout_child',
  'set_radius',
  'set_fill',
  'set_stroke',
  'set_text',
  'set_text_properties',
  'delete_node',
  'reparent_node',
  'node_resize',
  'batch_update',
  'stock_photo',
  'describe',
  'diff_changes',
  'diff_create',
  'diff_jsx',
  'diff_visual',
  'calc',
  'eval',
  'viewport_zoom_to_fit',
  'get_page_tree',
  'get_current_page',
  'list_pages',
  'select_nodes',
  'query_nodes',
  'get_components',
  'list_libraries',
  'insert_library_component',
  'switch_page',
  'page_bounds',
  'get_comments',
  'add_comment',
  'reply_to_comment',
  'resolve_comment',
  'get_statuses',
  'set_status',
  'get_font_status',
  'list_fonts',
  'list_available_fonts',
  'create_shape',
  'search_icons',
  'insert_icon',
  'fetch_icons',
  'combine_as_variants',
  'create_component',
  'create_instance',
  'expose_instance_swap',
  'create_slot',
  'get_behaviour',
  'set_behaviour',
  'create_page',
  'create_vector',
  'create_slice',
  'create_connector',
  'import_svg',
  'import_mermaid',
  'set_effects',
  'set_opacity',
  'set_font',
  'set_visible',
  'set_constraints',
  'set_rotation',
  'set_minmax',
  'set_font_range',
  'set_text_resize',
  'set_blend',
  'set_locked',
  'set_stroke_align',
  'set_image_fill',
  'clone_node',
  'node_move',
  'rename_node',
  'group_nodes',
  'ungroup_node',
  'flatten_nodes',
  'node_to_component',
  'node_bounds',
  'node_ancestors',
  'node_children',
  'node_tree',
  'node_bindings',
  'node_replace_with',
  'arrange',
  'list_variables',
  'list_collections',
  'get_variable',
  'find_variables',
  'create_variable',
  'set_variable',
  'delete_variable',
  'bind_variable',
  'unbind_variable',
  'get_collection',
  'create_collection',
  'delete_collection',
  'boolean_union',
  'boolean_subtract',
  'boolean_intersect',
  'boolean_exclude',
  'path_get',
  'path_set',
  'path_scale',
  'path_flip',
  'path_move',
  'viewport_get',
  'viewport_set',
  'export_svg',
  'export_pdf',
  'export_image',
  'analyze_colors',
  'analyze_typography',
  'lint',
  'lint_fix',
  'analyze_spacing',
  'analyze_clusters',
  'analyze_overlaps',
  'diff_show',
  'diff_apply',
  'design_to_tokens',
  'import_design_tokens',
  'design_to_component_map'
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export type StructuralKind = 'create' | 'update' | 'delete' | 'query'

/** Node-creating tools. Variable and collection creates stay out of this milestone. */
const CREATE_TOOLS = [
  'create_shape',
  'create_page',
  'create_slice',
  'create_component',
  'create_instance',
  'create_vector',
  'create_connector',
  'create_slot'
] as const satisfies readonly ToolName[]

const UPDATE_TOOLS = ['update_node', 'batch_update'] as const satisfies readonly ToolName[]

const DELETE_TOOLS = ['delete_node'] as const satisfies readonly ToolName[]

const QUERY_TOOLS = ['query_nodes'] as const satisfies readonly ToolName[]

function pairs(
  names: readonly ToolName[],
  kind: StructuralKind
): Array<[ToolName, StructuralKind]> {
  return names.map((name) => [name, kind])
}

const STRUCTURAL_KINDS = new Map<string, StructuralKind>([
  ...pairs(CREATE_TOOLS, 'create'),
  ...pairs(UPDATE_TOOLS, 'update'),
  ...pairs(DELETE_TOOLS, 'delete'),
  ...pairs(QUERY_TOOLS, 'query')
])

/** Create, update, delete, and query are the structural tools this milestone runs. */
export function structuralKind(name: string): StructuralKind | undefined {
  return STRUCTURAL_KINDS.get(name)
}
