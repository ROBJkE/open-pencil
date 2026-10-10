# Erste Schritte

## Webversion

OpenPencil läuft direkt im Browser und muss nicht installiert werden. Öffnen Sie [app.openpencil.dev](https://app.openpencil.dev), um mit der Gestaltung zu beginnen.

Wenn Sie ein eigenes Produkt auf OpenPencil aufbauen möchten, lesen Sie den Bereich [Automatisierung](/programmable/) und die Dokumentation zum [Vue SDK](/programmable/sdk/).

## Desktop-Anwendung

Fertige Versionen für macOS, Windows und Linux finden Sie auf der [Release-Seite](https://github.com/open-pencil/open-pencil/releases/latest).

| Plattform | Datei |
| --------------------- | -------------------- |
| macOS (Apple Silicon) | `OpenPencil` |
| macOS (Intel) | `OpenPencil` |
| Windows (x64) | `OpenPencil.exe` |
| Windows (ARM) | `OpenPencil.exe` |
| Linux (x64) | `OpenPencil` |

## Systemvoraussetzungen

OpenPencil rendert mit CanvasKit über WebGL und nutzt aktuelle Webplattform-Funktionen, daher ist eine neuere Browser-Engine erforderlich. Die Webversion unterstützt Chrome 111, Edge 111, Firefox 128 und Safari 16.4 oder neuer; Chromium-basierte Browser wie Brave und Opera richten sich nach ihrer Chrome-Version. Die Desktop-Anwendung ist ein natives Iced-Fenster:

| Plattform | Voraussetzung |
| --------- | ------------- |
| macOS | Ein aktuelles macOS. |
| Windows | Windows 10 oder neuer. |
| Linux | GTK 3 für Dateidialoge sowie libxkbcommon, Wayland und Vulkan zum Bauen. |

Ist die Engine zu alt, zeigt OpenPencil an, was aktualisiert werden muss, statt ein leeres Fenster darzustellen. Erscheint dieser Hinweis auf einem System, das die Voraussetzungen erfüllt, verwenden Sie den Link „Report a problem“, der die Angaben zu Browser und Engine vorausfüllt.

## Installation unter macOS mit Homebrew

```sh
brew install --cask openpencil
```

Der Befehl installiert die signierte App für Macs mit Apple Silicon oder Intel-Prozessor aus dem [offiziellen Homebrew-Katalog](https://formulae.brew.sh/cask/openpencil). Updates werden von Homebrew geprüft und können später als GitHub-Releases erscheinen. Bis dahin steht der [direkte Download](https://github.com/open-pencil/open-pencil/releases/latest) bereit. Die CLI wird separat installiert: `npm install -g @open-pencil/cli`.

Wenn du den archivierten eigenen Tap verwendet hast, wechsle so:

```sh
brew uninstall open-pencil/tap/open-pencil
brew install --cask openpencil
```

## Aus dem Quellcode erstellen

### Voraussetzungen

- [Bun](https://bun.sh/) als Runtime und Package Manager;
- [Rust](https://rustup.rs/) 1.88 oder neuer, nur für die Desktop-Anwendung.

### Installation

```sh
git clone https://github.com/open-pencil/open-pencil.git
cd open-pencil
bun install
```

### Entwicklungsserver

```sh
bun run dev
```

Der Editor ist anschließend unter `http://localhost:1420` erreichbar.

### Befehle

| Befehl | Zweck |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `bun run dev` | Entwicklungsserver mit HMR starten |
| `bun run build` | Produktionsversion erstellen |
| `bun run check` | oxlint und Typprüfung mit tsgo ausführen |
| `bun run test` | E2E- und visuelle Regressionstests mit Playwright ausführen |
| `bun run test:update` | Referenz-Screenshots aktualisieren |
| `bun run test:unit` | Unit-Tests mit bun:test ausführen |
| `bun run docs:dev` | Entwicklungsserver der Dokumentation starten |
| `bun run docs:build` | Dokumentation schnell zur lokalen Prüfung erstellen |
| `bun run docs:build:production` | Vollständige veröffentlichungsfähige Dokumentation einschließlich LLM-Dateien erstellen |

## Desktop-Anwendung (Iced)

Das Desktop-Fenster ist eine native [Iced](https://iced.rs/)-Anwendung. Sie braucht Rust 1.88 oder neuer und [Bun](https://bun.sh). Installieren Sie die Abhängigkeiten, bauen Sie die Pakete und starten Sie das Fenster aus einem Checkout. Die Editor-Sitzung ist ein Bun-Prozess, der `@open-pencil/core` steuert.

```sh
bun install
bun run build:packages
bun run desktop
```

### Windows

Installieren Sie [Rust](https://rustup.rs/) mit der Toolchain `stable-msvc` und die [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) mit der Workload **Desktop development with C++**, und führen Sie dann `bun run desktop` aus.

### Linux

Installieren Sie unter Debian oder Ubuntu die Systemabhängigkeiten:

```sh
sudo apt install pkg-config libxkbcommon-dev libwayland-dev libvulkan-dev libgtk-3-dev libssl-dev
```

Dateidialoge brauchen außerdem GTK oder ein XDG-Desktop-Portal. Führen Sie anschließend `bun run desktop` aus.

### Release bauen

```sh
cd desktop && cargo build --release
```

Die Binärdatei liegt unter `desktop/target/release/OpenPencil` (unter Windows `OpenPencil.exe`). Sie startet die Editor-Sitzung weiter mit Bun aus diesem Repository, sofern `OPENPENCIL_SESSION_HOST` nicht auf `packages/cli/src/desktop-session/serve.ts` zeigt.
