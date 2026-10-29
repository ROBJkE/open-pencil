/**
 * Desktop-only. WebMCP is absent from this milestone: the editor runs in
 * Electron and there is no browser host to serve it.
 *
 * One registry, copied from the current Core tool names. Structural create,
 * update, delete, and query run as session commands on a DocumentStore. Any
 * other name returns `not-in-this-milestone` and does not touch the document.
 * `eval(source)` interprets `openpencil.getNode` and `openpencil.setField`
 * only. There is no figma global.
 */

export { DEFAULT_EXPORT_FORMAT, DROP_LIST, EXPORT_FORMATS } from './drops'
export { structuralKind, TOOL_NAMES, type StructuralKind, type ToolName } from './names'
export {
  INVALID_INPUT,
  NOT_IN_THIS_MILESTONE,
  OUTSIDE_SELECTION,
  UNSUPPORTED_SCRIPT,
  type ToolOutcome
} from './outcome'
export { AUTOMATION_SCOPES, type AutomationScope } from './scope'
export { createAutomationSession, type AutomationSession } from './session'
