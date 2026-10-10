# Primi passi

## Versione web

OpenPencil funziona direttamente nel browser e non richiede installazione. Apri [app.openpencil.dev](https://app.openpencil.dev) per iniziare a progettare.

Se vuoi creare un prodotto basato su OpenPencil invece di utilizzare soltanto l'applicazione predefinita, consulta la sezione [Automazione](/programmable/) e la documentazione del [Vue SDK](/programmable/sdk/).

## Applicazione desktop

Le versioni pronte per macOS, Windows e Linux sono disponibili nella [pagina delle versioni](https://github.com/open-pencil/open-pencil/releases/latest).

| Piattaforma | File |
| --------------------- | -------------------- |
| macOS (Apple Silicon) | `OpenPencil` |
| macOS (Intel) | `OpenPencil` |
| Windows (x64) | `OpenPencil.exe` |
| Windows (ARM) | `OpenPencil.exe` |
| Linux (x64) | `OpenPencil` |

## Requisiti di sistema

OpenPencil esegue il rendering con CanvasKit su WebGL e usa funzionalità recenti della piattaforma web, quindi richiede un motore del browser aggiornato. L’app web supporta Chrome 111, Edge 111, Firefox 128 e Safari 16.4 o versioni successive; i browser basati su Chromium, come Brave e Opera, seguono la versione di Chrome. L’app desktop è una finestra nativa Iced:

| Piattaforma | Requisito |
| ----------- | --------- |
| macOS | Un macOS aggiornato. |
| Windows | Windows 10 o successivo. |
| Linux | GTK 3 per le finestre di dialogo, più libxkbcommon, Wayland e Vulkan per compilare. |

Se il motore è troppo vecchio, OpenPencil mostra cosa aggiornare invece di una finestra vuota. Se vedi questo avviso su un sistema che soddisfa i requisiti, usa il link «Report a problem», che precompila i dettagli di browser e motore.

## Installazione in macOS con Homebrew

```sh
brew install --cask openpencil
```

Il comando installa l’app firmata per Mac con Apple Silicon o processore Intel dal [catalogo ufficiale Homebrew](https://formulae.brew.sh/cask/openpencil). Gli aggiornamenti vengono verificati da Homebrew e possono arrivare dopo le versioni su GitHub. Nel frattempo, usa il [download diretto](https://github.com/open-pencil/open-pencil/releases/latest). La CLI si installa separatamente: `npm install -g @open-pencil/cli`.

Se usavi il tap personalizzato archiviato, migra con:

```sh
brew uninstall open-pencil/tap/open-pencil
brew install --cask openpencil
```

## Compilazione dal codice sorgente

### Requisiti

- [Bun](https://bun.sh/) come runtime e package manager;
- [Rust](https://rustup.rs/) 1.88 o successivo, soltanto per l'applicazione desktop.

### Installazione

```sh
git clone https://github.com/open-pencil/open-pencil.git
cd open-pencil
bun install
```

### Server di sviluppo

```sh
bun run dev
```

L'editor sarà disponibile all'indirizzo `http://localhost:1420`.

### Comandi

| Comando | Funzione |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `bun run dev` | Avvia il server di sviluppo con HMR |
| `bun run build` | Genera la versione di produzione |
| `bun run check` | Esegue oxlint e controlla i tipi con tsgo |
| `bun run test` | Esegue i test E2E e di regressione visiva con Playwright |
| `bun run test:update` | Aggiorna gli screenshot di riferimento |
| `bun run test:unit` | Esegue gli unit test con bun:test |
| `bun run docs:dev` | Avvia il server di sviluppo della documentazione |
| `bun run docs:build` | Genera rapidamente la documentazione per la verifica locale |
| `bun run docs:build:production` | Genera la documentazione completa per la pubblicazione, inclusi i file per gli LLM |

## Applicazione desktop (Iced)

La finestra desktop è un'applicazione nativa [Iced](https://iced.rs/). Serve Rust 1.88 o successivo e [Bun](https://bun.sh). Installa le dipendenze, compila i pacchetti e avvia la finestra da un checkout. La sessione dell'editor è un processo Bun che guida `@open-pencil/core`.

```sh
bun install
bun run build:packages
bun run desktop
```

### Windows

Installa [Rust](https://rustup.rs/) con il toolchain `stable-msvc` e [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) con il workload **Desktop development with C++**, poi esegui `bun run desktop`.

### Linux

In Debian o Ubuntu, installa le dipendenze di sistema:

```sh
sudo apt install pkg-config libxkbcommon-dev libwayland-dev libvulkan-dev libgtk-3-dev libssl-dev
```

Le finestre di dialogo richiedono anche GTK o un portale desktop XDG. Poi esegui `bun run desktop`.

### Build di distribuzione

```sh
cd desktop && cargo build --release
```

Il binario è `desktop/target/release/OpenPencil` (`OpenPencil.exe` su Windows). Avvia ancora la sessione dell'editor con Bun da questo repository, a meno che `OPENPENCIL_SESSION_HOST` non punti a `packages/cli/src/desktop-session/serve.ts`.
