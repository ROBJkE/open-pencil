export interface OwnedToolLaunch {
  command: string
  args: readonly string[]
  env: { ELECTRON_RUN_AS_NODE: '1' }
}

/**
 * Our MCP server and CLI run on Electron's bundled Node. `command` is this
 * process's executable, which inside Electron is the Electron binary, not a
 * `node` found on PATH.
 */
export function ownedToolLaunch(
  script: string,
  args: readonly string[] = [],
  executable = process.execPath
): OwnedToolLaunch {
  return {
    command: executable,
    args: [script, ...args],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
}
