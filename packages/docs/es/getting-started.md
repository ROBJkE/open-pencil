# Primeros pasos

## Versión web

OpenPencil funciona directamente en el navegador y no requiere instalación. Abre [app.openpencil.dev](https://app.openpencil.dev) para empezar a diseñar.

Si quieres crear un producto basado en OpenPencil en lugar de limitarte a la aplicación predeterminada, consulta la sección [Automatización](/programmable/) y la documentación del [Vue SDK](/programmable/sdk/).

## Aplicación de escritorio

Las versiones preparadas para macOS, Windows y Linux están disponibles en la [página de versiones](https://github.com/open-pencil/open-pencil/releases/latest).

| Plataforma | Archivo |
| --------------------- | -------------------- |
| macOS (Apple Silicon) | `OpenPencil` |
| macOS (Intel) | `OpenPencil` |
| Windows (x64) | `OpenPencil.exe` |
| Windows (ARM) | `OpenPencil.exe` |
| Linux (x64) | `OpenPencil` |

## Requisitos del sistema

OpenPencil dibuja con CanvasKit sobre WebGL y usa funciones recientes de la plataforma web, por lo que necesita un motor de navegador actual. La versión web admite Chrome 111, Edge 111, Firefox 128 y Safari 16.4 o posteriores; los navegadores basados en Chromium, como Brave u Opera, siguen la versión de Chrome en la que se basan. La aplicación de escritorio es una ventana nativa de Iced:

| Plataforma | Requisito |
| ---------- | --------- |
| macOS | Un macOS actual. |
| Windows | Windows 10 o posterior. |
| Linux | GTK 3 para los diálogos de archivo, y libxkbcommon, Wayland y Vulkan para compilar. |

Si el motor es demasiado antiguo, OpenPencil muestra qué debes actualizar en lugar de una ventana en blanco. Si ves ese aviso en un sistema que cumple los requisitos, usa su enlace «Report a problem», que rellena de antemano los datos del navegador y del motor.

## Instalación en macOS con Homebrew

```sh
brew install --cask openpencil
```

El comando instala la aplicación firmada para Mac con Apple Silicon o procesador Intel desde el [catálogo oficial de Homebrew](https://formulae.brew.sh/cask/openpencil). Homebrew revisa las actualizaciones, que pueden aparecer después de las versiones en GitHub. Mientras tanto, utiliza la [descarga directa](https://github.com/open-pencil/open-pencil/releases/latest). La CLI se instala por separado: `npm install -g @open-pencil/cli`.

Si usabas el tap propio archivado, migra con:

```sh
brew uninstall open-pencil/tap/open-pencil
brew install --cask openpencil
```

## Compilación desde el código fuente

### Requisitos

- [Bun](https://bun.sh/) como runtime y package manager;
- [Rust](https://rustup.rs/) 1.88 o posterior, solo para la aplicación de escritorio.

### Instalación

```sh
git clone https://github.com/open-pencil/open-pencil.git
cd open-pencil
bun install
```

### Servidor de desarrollo

```sh
bun run dev
```

El editor estará disponible en `http://localhost:1420`.

### Comandos

| Comando | Finalidad |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `bun run dev` | Inicia el servidor de desarrollo con HMR |
| `bun run build` | Genera la versión de producción |
| `bun run check` | Ejecuta oxlint y comprueba los tipos con tsgo |
| `bun run test` | Ejecuta las pruebas E2E y de regresión visual con Playwright |
| `bun run test:update` | Actualiza las capturas de referencia |
| `bun run test:unit` | Ejecuta las pruebas unitarias con bun:test |
| `bun run docs:dev` | Inicia el servidor de desarrollo de la documentación |
| `bun run docs:build` | Genera rápidamente la documentación para verificarla en local |
| `bun run docs:build:production` | Genera la documentación completa para su publicación, incluidos los archivos para LLM |

## Aplicación de escritorio (Iced)

La ventana de escritorio es una aplicación nativa de [Iced](https://iced.rs/). Necesita Rust 1.88 o posterior y [Bun](https://bun.sh). Instala las dependencias, compila los paquetes y arranca la ventana desde un checkout. La sesión del editor es un proceso de Bun que usa `@open-pencil/core`.

```sh
bun install
bun run build:packages
bun run desktop
```

### Windows

Instala [Rust](https://rustup.rs/) con el toolchain `stable-msvc` y [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) con el workload **Desktop development with C++**, y ejecuta `bun run desktop`.

### Linux

En Debian o Ubuntu, instala las dependencias del sistema:

```sh
sudo apt install pkg-config libxkbcommon-dev libwayland-dev libvulkan-dev libgtk-3-dev libssl-dev
```

Los diálogos de archivo también necesitan GTK o un portal de escritorio XDG. Después ejecuta `bun run desktop`.

### Compilar para distribución

```sh
cd desktop && cargo build --release
```

El binario queda en `desktop/target/release/OpenPencil` (`OpenPencil.exe` en Windows). Sigue arrancando la sesión del editor con Bun desde este repositorio, salvo que `OPENPENCIL_SESSION_HOST` apunte a `packages/cli/src/desktop-session/serve.ts`.
