/**
 * Description of the hidden page an HTML import would open.
 * JavaScript stays off and the page has no network and no Node integration.
 * Building this object does not launch a browser.
 */
export interface HTMLImportRequest {
  readonly kind: 'html-import'
  readonly hidden: true
  readonly javascript: false
  readonly network: false
  readonly nodeIntegration: false
  readonly html: string
}

export function htmlImportRequest(html: string): HTMLImportRequest {
  return {
    kind: 'html-import',
    hidden: true,
    javascript: false,
    network: false,
    nodeIntegration: false,
    html
  }
}
