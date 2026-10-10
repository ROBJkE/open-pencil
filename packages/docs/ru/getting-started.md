# Начало работы

## Веб-версия

OpenPencil работает прямо в браузере и не требует установки. Чтобы начать работу, откройте [app.openpencil.dev](https://app.openpencil.dev).

Если вы хотите создать на основе OpenPencil собственный продукт, а не только пользоваться готовым приложением, перейдите в раздел [Программирование и автоматизация](/programmable/) или прочитайте документацию [Vue SDK](/programmable/sdk/).

## Приложение для компьютера

Готовые версии для macOS, Windows и Linux опубликованы на [странице релизов](https://github.com/open-pencil/open-pencil/releases/latest).

| Платформа | Файл |
| --------------------- | -------------------- |
| macOS (Apple Silicon) | `OpenPencil` |
| macOS (Intel) | `OpenPencil` |
| Windows (x64) | `OpenPencil.exe` |
| Windows (ARM) | `OpenPencil.exe` |
| Linux (x64) | `OpenPencil` |

## Системные требования

OpenPencil отрисовывает графику через CanvasKit на WebGL и использует современные возможности веб-платформы, поэтому нужен свежий движок браузера. Веб-версия работает в Chrome 111, Edge 111, Firefox 128 и Safari 16.4 или новее; браузеры на основе Chromium, например Brave и Opera, ориентируются на версию своего Chrome. Настольное приложение — нативное окно Iced:

| Платформа | Требование |
| --------- | ---------- |
| macOS | Актуальная версия macOS. |
| Windows | Windows 10 или новее. |
| Linux | GTK 3 для диалогов файлов, а также libxkbcommon, Wayland и Vulkan для сборки. |

Если движок слишком старый, OpenPencil вместо пустого окна показывает, что нужно обновить. Если вы видите такое уведомление в системе, которая подходит под требования, воспользуйтесь ссылкой «Report a problem»: в ней уже указаны сведения о браузере и движке.

## Установка в macOS через Homebrew

```sh
brew install --cask openpencil
```

Команда устанавливает подписанное приложение для Mac с Apple Silicon или Intel из [официального каталога Homebrew](https://formulae.brew.sh/cask/openpencil). Обновления проходят проверку в Homebrew и могут появляться позже релизов на GitHub. До обновления каталога используйте [прямую загрузку](https://github.com/open-pencil/open-pencil/releases/latest). CLI устанавливается отдельно: `npm install -g @open-pencil/cli`.

Если вы использовали архивный собственный tap, перейдите так:

```sh
brew uninstall open-pencil/tap/open-pencil
brew install --cask openpencil
```

## Сборка из исходного кода

### Что потребуется

- [Bun](https://bun.sh/) — среда выполнения и менеджер пакетов;
- [Rust](https://rustup.rs/) 1.88 или новее — только для настольного приложения.

### Установка

```sh
git clone https://github.com/open-pencil/open-pencil.git
cd open-pencil
bun install
```

### Сервер для разработки

```sh
bun run dev
```

Редактор будет доступен по адресу `http://localhost:1420`.

### Команды

| Команда | Назначение |
| ------------------------------- | -------------------------------------------------------------------- |
| `bun run dev` | Запустить сервер разработки с HMR |
| `bun run build` | Собрать версию для публикации |
| `bun run check` | Запустить oxlint и проверку типов с помощью tsgo |
| `bun run test` | Запустить сквозные тесты и сравнение внешнего вида в Playwright |
| `bun run test:update` | Обновить эталонные снимки экрана |
| `bun run test:unit` | Запустить модульные тесты с помощью bun:test |
| `bun run docs:dev` | Запустить сервер разработки документации |
| `bun run docs:build` | Быстро собрать документацию для локальной проверки |
| `bun run docs:build:production` | Полностью собрать документацию для публикации, включая файлы для LLM |

## Настольное приложение (Iced)

Окно рабочего стола — нативное приложение [Iced](https://iced.rs/). Нужны Rust 1.88 или новее и [Bun](https://bun.sh). Установите зависимости, соберите пакеты и запустите окно из checkout. Сессия редактора — процесс Bun, который вызывает `@open-pencil/core`.

```sh
bun install
bun run build:packages
bun run desktop
```

### Windows

Установите [Rust](https://rustup.rs/) с toolchain `stable-msvc` и [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) с workload **Desktop development with C++**, затем выполните `bun run desktop`.

### Linux

В Debian или Ubuntu установите системные зависимости:

```sh
sudo apt install pkg-config libxkbcommon-dev libwayland-dev libvulkan-dev libgtk-3-dev libssl-dev
```

Диалоги файлов также требуют GTK или XDG desktop portal. Затем выполните `bun run desktop`.

### Сборка для распространения

```sh
cd desktop && cargo build --release
```

Файл — `desktop/target/release/OpenPencil` (в Windows `OpenPencil.exe`). Он по-прежнему запускает сессию редактора через Bun из этого репозитория, если `OPENPENCIL_SESSION_HOST` не указывает на `packages/cli/src/desktop-session/serve.ts`.
