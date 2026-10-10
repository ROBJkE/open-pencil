# Pierwsze kroki

## Wersja internetowa

OpenPencil działa bezpośrednio w przeglądarce i nie wymaga instalacji. Otwórz [app.openpencil.dev](https://app.openpencil.dev), aby rozpocząć pracę.

Jeśli chcesz zbudować własny produkt na bazie OpenPencil, a nie tylko korzystać z gotowej aplikacji, przejdź do sekcji [Automatyzacja](/programmable/) lub dokumentacji [Vue SDK](/programmable/sdk/).

## Aplikacja na komputer

Gotowe wersje dla macOS, Windows i Linux są dostępne na [stronie wydań](https://github.com/open-pencil/open-pencil/releases/latest).

| Platforma | Plik |
| --------------------- | -------------------- |
| macOS (Apple Silicon) | `OpenPencil` |
| macOS (Intel) | `OpenPencil` |
| Windows (x64) | `OpenPencil.exe` |
| Windows (ARM) | `OpenPencil.exe` |
| Linux (x64) | `OpenPencil` |

## Wymagania systemowe

OpenPencil renderuje przez CanvasKit na WebGL i korzysta z nowoczesnych funkcji platformy webowej, dlatego wymaga aktualnego silnika przeglądarki. Wersja internetowa działa w Chrome 111, Edge 111, Firefox 128 i Safari 16.4 lub nowszych; przeglądarki oparte na Chromium, takie jak Brave i Opera, odpowiadają wersji Chrome, na której bazują. Aplikacja na komputer to natywne okno Iced:

| Platforma | Wymaganie |
| --------- | --------- |
| macOS | Aktualne macOS. |
| Windows | Windows 10 lub nowszy. |
| Linux | GTK 3 do okien dialogowych oraz libxkbcommon, Wayland i Vulkan do budowania. |

Gdy silnik jest zbyt stary, OpenPencil zamiast pustego okna pokazuje, co należy zaktualizować. Jeśli widzisz to powiadomienie w systemie spełniającym wymagania, użyj odnośnika „Report a problem”, który uzupełnia dane przeglądarki i silnika.

## Instalacja w macOS przez Homebrew

```sh
brew install --cask openpencil
```

Polecenie instaluje podpisaną aplikację dla komputerów Mac z Apple Silicon lub procesorem Intel z [oficjalnego katalogu Homebrew](https://formulae.brew.sh/cask/openpencil). Aktualizacje są weryfikowane przez Homebrew i mogą pojawiać się później niż wydania na GitHubie. W tym czasie skorzystaj z [bezpośredniego pobierania](https://github.com/open-pencil/open-pencil/releases/latest). CLI instaluje się osobno: `npm install -g @open-pencil/cli`.

Jeśli używałeś zarchiwizowanego własnego tapa, przeprowadź migrację:

```sh
brew uninstall open-pencil/tap/open-pencil
brew install --cask openpencil
```

## Budowanie ze źródeł

### Wymagania

- [Bun](https://bun.sh/) — runtime i package manager;
- [Rust](https://rustup.rs/) 1.88 lub nowszy — tylko do aplikacji desktopowej.

### Instalacja

```sh
git clone https://github.com/open-pencil/open-pencil.git
cd open-pencil
bun install
```

### Serwer deweloperski

```sh
bun run dev
```

Edytor będzie dostępny pod adresem `http://localhost:1420`.

### Polecenia

| Polecenie | Zastosowanie |
| ------------------------------- | ------------------------------------------------------------------- |
| `bun run dev` | Uruchamia serwer deweloperski z HMR |
| `bun run build` | Buduje wersję produkcyjną |
| `bun run check` | Uruchamia oxlint i sprawdzanie typów za pomocą tsgo |
| `bun run test` | Uruchamia testy E2E i testy wyglądu w Playwright |
| `bun run test:update` | Aktualizuje wzorcowe zrzuty ekranu |
| `bun run test:unit` | Uruchamia testy jednostkowe za pomocą bun:test |
| `bun run docs:dev` | Uruchamia serwer deweloperski dokumentacji |
| `bun run docs:build` | Szybko buduje dokumentację do lokalnej weryfikacji |
| `bun run docs:build:production` | Buduje pełną wersję dokumentacji do publikacji, w tym pliki dla LLM |

## Aplikacja desktopowa (Iced)

Okno desktopowe to natywna aplikacja [Iced](https://iced.rs/). Wymaga Rust 1.88 lub nowszego oraz [Bun](https://bun.sh). Zainstaluj zależności, zbuduj pakiety i uruchom okno z checkoutu. Sesja edytora to proces Bun, który steruje `@open-pencil/core`.

```sh
bun install
bun run build:packages
bun run desktop
```

### Windows

Zainstaluj [Rust](https://rustup.rs/) z toolchain `stable-msvc` oraz [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) z workload **Desktop development with C++**, a następnie uruchom `bun run desktop`.

### Linux

W Debianie lub Ubuntu zainstaluj zależności systemowe:

```sh
sudo apt install pkg-config libxkbcommon-dev libwayland-dev libvulkan-dev libgtk-3-dev libssl-dev
```

Okna dialogowe potrzebują też GTK albo portalu pulpitu XDG. Następnie uruchom `bun run desktop`.

### Budowanie wydania

```sh
cd desktop && cargo build --release
```

Plik binarny to `desktop/target/release/OpenPencil` (w Windows `OpenPencil.exe`). Nadal uruchamia sesję edytora przez Bun z tego repozytorium, chyba że `OPENPENCIL_SESSION_HOST` wskazuje `packages/cli/src/desktop-session/serve.ts`.
