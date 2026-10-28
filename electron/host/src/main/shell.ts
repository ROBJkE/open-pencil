export const EMPTY_SHELL_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OpenPencil</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`

export function emptyShellURL(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(EMPTY_SHELL_HTML)}`
}

export const UPDATE_SHELL_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Software Update</title>
  </head>
  <body>
    <h1>Software Update</h1>
    <p id="status">This window does not keep documents open.</p>
    <button id="check" type="button">Check</button>
    <button id="download" type="button">Download</button>
    <button id="restart" type="button">Restart</button>
    <button id="close" type="button">Close</button>
    <script>
      const api = globalThis.openpencilUpdate
      const status = document.getElementById('status')
      function setStatus(text) {
        if (status) status.textContent = text
      }
      if (!api) {
        setStatus('Software update is unavailable.')
      } else {
        api.onStatus((next) => {
          setStatus(next.detail || next.state)
        })
        document.getElementById('check').addEventListener('click', () => {
          void api.check()
        })
        document.getElementById('download').addEventListener('click', () => {
          void api.download()
        })
        document.getElementById('restart').addEventListener('click', () => {
          void api.restart()
        })
        document.getElementById('close').addEventListener('click', () => {
          void api.close()
        })
      }
    </script>
  </body>
</html>
`

export function updateShellURL(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(UPDATE_SHELL_HTML)}`
}
