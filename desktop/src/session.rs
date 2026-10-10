//! Stdio client for the desktop editor session.
//!
//! The Iced window owns this process. The host is a Bun program that drives
//! `@open-pencil/core` through its public exports; this module only speaks the
//! newline-delimited JSON protocol.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};

use base64::Engine;
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct Snapshot {
    pub title: String,
    pub path: Option<String>,
    pub dirty: bool,
    pub can_undo: bool,
    pub can_redo: bool,
    pub page_id: String,
    pub pages: Vec<PageInfo>,
    pub nodes: Vec<LayerInfo>,
    pub zoom: f64,
    pub png: Option<Vec<u8>>,
    pub view: Option<ViewBox>,
    pub preview_error: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LayerInfo {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub depth: usize,
    pub selected: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewBox {
    pub min_x: f64,
    pub min_y: f64,
    pub width: f64,
    pub height: f64,
    pub pixel_width: u32,
    pub pixel_height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireSnapshot {
    title: String,
    path: Option<String>,
    dirty: bool,
    can_undo: bool,
    can_redo: bool,
    page_id: String,
    pages: Vec<PageInfo>,
    nodes: Vec<LayerInfo>,
    zoom: f64,
    png_base64: Option<String>,
    view: Option<ViewBox>,
    preview_error: Option<String>,
    status: String,
}

#[derive(Debug, Deserialize)]
struct WireResponse {
    id: u64,
    ok: bool,
    result: Option<WireSnapshot>,
    error: Option<String>,
}

pub struct SessionClient {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
    next_id: u64,
}

impl std::fmt::Debug for SessionClient {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SessionClient")
            .field("next_id", &self.next_id)
            .finish_non_exhaustive()
    }
}

impl SessionClient {
    pub async fn spawn() -> Result<Arc<Mutex<Self>>, String> {
        let client = tokio::task::spawn_blocking(Self::start)
            .await
            .map_err(|error| error.to_string())??;
        Ok(Arc::new(Mutex::new(client)))
    }

    fn start() -> Result<Self, String> {
        let script = session_script()?;
        let repo = workspace_root(&script)?;
        let bun = std::env::var("OPENPENCIL_BUN").unwrap_or_else(|_| "bun".to_string());
        let mut child = Command::new(&bun)
            .arg(&script)
            .current_dir(&repo)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                format!(
                    "Could not start the editor session with `{bun}` ({}): {error}",
                    script.display()
                )
            })?;
        if let Some(stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines() {
                    if let Ok(line) = line {
                        eprintln!("[desktop-session] {line}");
                    }
                }
            });
        }
        let stdin = child.stdin.take().ok_or("Editor session has no stdin")?;
        let stdout = child.stdout.take().ok_or("Editor session has no stdout")?;
        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 1,
        })
    }

    pub fn call(&mut self, method: &str, extra: serde_json::Value) -> Result<Snapshot, String> {
        let id = self.next_id;
        self.next_id += 1;
        let mut body = match extra {
            serde_json::Value::Object(map) => map,
            _ => return Err("Session request must be a JSON object".to_string()),
        };
        body.insert("id".to_string(), serde_json::json!(id));
        body.insert(
            "method".to_string(),
            serde_json::Value::String(method.to_string()),
        );
        let line = serde_json::Value::Object(body).to_string();
        writeln!(self.stdin, "{line}")
            .map_err(|error| format!("Could not write to the editor session: {error}"))?;
        self.stdin
            .flush()
            .map_err(|error| format!("Could not flush the editor session: {error}"))?;
        let mut response = String::new();
        let read = self
            .stdout
            .read_line(&mut response)
            .map_err(|error| format!("Could not read the editor session: {error}"))?;
        if read == 0 {
            return Err("The editor session closed".to_string());
        }
        parse_response(id, &response)
    }
}

impl Drop for SessionClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn session_script() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("OPENPENCIL_SESSION_HOST") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "OPENPENCIL_SESSION_HOST is not a file: {}",
            path.display()
        ));
    }
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../packages/cli/src/desktop-session/serve.ts");
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!(
            "Editor session host is missing at {}. Set OPENPENCIL_SESSION_HOST.",
            path.display()
        ))
    }
}

fn workspace_root(script: &Path) -> Result<PathBuf, String> {
    let mut dir = script
        .parent()
        .ok_or("Editor session host has no parent directory")?
        .to_path_buf();
    loop {
        if dir.join("bun.lock").is_file() {
            return Ok(dir);
        }
        if !dir.pop() {
            return Err(
                "Could not find the OpenPencil workspace from the session host".to_string(),
            );
        }
    }
}

fn parse_response(id: u64, line: &str) -> Result<Snapshot, String> {
    let response: WireResponse = serde_json::from_str(line)
        .map_err(|error| format!("Editor session returned invalid JSON: {error}"))?;
    if response.id != id {
        return Err(format!(
            "Editor session replied to request {}, expected {id}",
            response.id
        ));
    }
    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "Editor session failed".to_string()));
    }
    let wire = response
        .result
        .ok_or("Editor session returned an empty result")?;
    let png = match wire.png_base64 {
        Some(text) if !text.is_empty() => Some(
            base64::engine::general_purpose::STANDARD
                .decode(text)
                .map_err(|error| {
                    format!("Editor session returned a preview that is not base64: {error}")
                })?,
        ),
        _ => None,
    };
    Ok(Snapshot {
        title: wire.title,
        path: wire.path,
        dirty: wire.dirty,
        can_undo: wire.can_undo,
        can_redo: wire.can_redo,
        page_id: wire.page_id,
        pages: wire.pages,
        nodes: wire.nodes,
        zoom: wire.zoom,
        png,
        view: wire.view,
        preview_error: wire.preview_error,
        status: wire.status,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_session_snapshot() {
        let line = r#"{"id":4,"ok":true,"result":{"title":"Untitled","path":null,"dirty":false,"canUndo":false,"canRedo":false,"pageId":"0:1","pages":[{"id":"0:1","name":"Page 1"}],"nodes":[],"zoom":1,"pngBase64":null,"view":null,"previewError":null,"status":"New document"}}"#;
        let snapshot = parse_response(4, line).expect("snapshot");
        assert_eq!(snapshot.title, "Untitled");
        assert_eq!(snapshot.page_id, "0:1");
        assert!(snapshot.png.is_none());
        assert_eq!(snapshot.pages[0].name, "Page 1");
    }

    #[test]
    fn reports_a_session_error() {
        let line = r#"{"id":2,"ok":false,"error":"missing file"}"#;
        let error = parse_response(2, line).expect_err("error");
        assert!(error.contains("missing file"));
    }
}
