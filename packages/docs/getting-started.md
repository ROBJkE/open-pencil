# Getting Started

## Try Online

OpenPencil runs in the browser — no installation required. Open [app.openpencil.dev](https://app.openpencil.dev) to start designing.

If you want to build on top of it instead of only using the default app, see the [Programmable](/programmable/) section and the [Vue SDK](/programmable/sdk/).

## Download Desktop App

Pre-built binaries for macOS, Windows, and Linux are available on the [releases page](https://github.com/open-pencil/open-pencil/releases/latest).

| Platform | Download |
| --------------------- | -------------------- |
| macOS (Apple Silicon) | `OpenPencil` |
| macOS (Intel) | `OpenPencil` |
| Windows (x64) | `OpenPencil.exe` |
| Windows (ARM) | `OpenPencil.exe` |
| Linux (x64) | `OpenPencil` |

## System Requirements

The web app renders with CanvasKit on WebGL and needs Chrome 111, Edge 111, Firefox 128, or Safari 16.4 or later; Chromium-based browsers such as Brave and Opera follow their Chrome version. The desktop app is a native Iced window:

| Platform | Requirement |
| -------- | ----------- |
| macOS | A current macOS release. |
| Windows | Windows 10 or later. |
| Linux | GTK 3 for file dialogs, plus libxkbcommon, Wayland, and Vulkan to build. |

When the engine is too old, OpenPencil shows what to update instead of a blank window. If you see that notice on a system that meets the requirements, use its "Report a problem" link, which prefills the browser and engine details.

## macOS via Homebrew

```sh
brew install --cask openpencil
```

This installs the signed macOS app (Apple Silicon and Intel) from the [official Homebrew cask](https://formulae.brew.sh/cask/openpencil). Homebrew updates are reviewed upstream and may lag behind GitHub releases. For a release not yet available through Homebrew, use the [direct download](https://github.com/open-pencil/open-pencil/releases/latest).

The desktop cask does not install the CLI; install it separately with `npm install -g @open-pencil/cli`.

If you used the archived custom tap, migrate with:

```sh
brew uninstall open-pencil/tap/open-pencil
brew install --cask openpencil
```

## Building from Source

### Prerequisites

- [Bun](https://bun.sh/) (package manager and runtime)
- [Rust](https://rustup.rs/) (for desktop app only)

## Installation

```sh
git clone https://github.com/open-pencil/open-pencil.git
cd open-pencil
bun install
```

## Development Server

```sh
bun run dev
```

Opens the editor at `http://localhost:1420`.

## Available Scripts

| Command | Description |
| ------------------------------- | --------------------------------------------------- |
| `bun run dev` | Dev server with HMR |
| `bun run build` | Production build |
| `bun run check` | Lint (oxlint) + typecheck (tsgo) |
| `bun run test` | E2E visual regression (Playwright) |
| `bun run test:update` | Regenerate screenshot baselines |
| `bun run test:unit` | Unit tests (bun:test) |
| `bun run docs:dev` | Documentation dev server |
| `bun run docs:build` | Build documentation locally (fast validation build) |
| `bun run docs:build:production` | Build deployable documentation, including LLM files |

## Desktop App (Iced)

The desktop window is a native [Iced](https://iced.rs/) app. It needs Rust 1.88 or later and [Bun](https://bun.sh). From a repository checkout, install dependencies and build the packages, then start the window. The editor session is a Bun process that drives `@open-pencil/core`.

```sh
bun install
bun run build:packages
bun run desktop
```

### Windows

Install [Rust](https://rustup.rs/) with the `stable-msvc` toolchain and [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, then run `bun run desktop`.

### Linux

Install system dependencies (Debian/Ubuntu):

```sh
sudo apt install pkg-config libxkbcommon-dev libwayland-dev libvulkan-dev libgtk-3-dev libssl-dev
```

File dialogs also need GTK or an XDG desktop portal. Then run `bun run desktop`.

### Build for distribution

```sh
cd desktop && cargo build --release
```

The binary is `desktop/target/release/OpenPencil` (`OpenPencil.exe` on Windows). It still starts the editor session with Bun from this repository unless `OPENPENCIL_SESSION_HOST` points at `packages/cli/src/desktop-session/serve.ts`.
