# Electron editor

Desktop rewrite beside the Tauri app. The window process runs Vue. Parsing, layout, raster, export, lint, and tool execution run in other processes. `desktop/`, `src/`, and `packages/` stay the behaviour and pixel reference until this tree matches them.

- `@open-pencil/session` (`electron/session`) is the only API the Vue UI, MCP, CLI, and agents call. It must not import Electron, Vue, CanvasKit, or Yoga (`electron/session/tests/boundaries.test.ts`).
- `@open-pencil/engine` (`electron/engine`) is the document utility process: one normalized graph per open file, inverse-operation history, and a `.pen` codec. It must not import `createEditor`, `@open-pencil/fig`, or `@open-pencil/kiwi`.
- `@open-pencil/vue-next` (`electron/sdk`) holds document-backed views and reads session projections. It does not own a scene graph.
- `@open-pencil/electron` (`electron/host`) is the Electron main process, preload, and Vue shell. `contextIsolation` stays on and the preload exposes the session client only.
- Domain modules stay in their folders (`graph/`, `pen/`, `layout/`, `render/`, `host/ui/`). A command the session schema does not list is a session change, not a local type.
- CanvasKit raster and Yoga stay inside the document process. The UI composites dirty tiles from `FrameTransport` and draws selection chrome from the latest pointer.
- Tests live in each package's `tests/` and run through the `electron` unit-test shard.
