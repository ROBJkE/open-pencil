# Premiers pas

## Version web

OpenPencil fonctionne directement dans le navigateur et ne nécessite aucune installation. Ouvrez [app.openpencil.dev](https://app.openpencil.dev) pour commencer à créer.

Si vous souhaitez développer votre propre produit avec OpenPencil plutôt que vous limiter à l'application par défaut, consultez la section [Automatisation](/programmable/) et la documentation du [Vue SDK](/programmable/sdk/).

## Application de bureau

Les versions prêtes à l'emploi pour macOS, Windows et Linux sont disponibles sur la [page des versions](https://github.com/open-pencil/open-pencil/releases/latest).

| Plateforme | Fichier |
| --------------------- | -------------------- |
| macOS (Apple Silicon) | `OpenPencil` |
| macOS (Intel) | `OpenPencil` |
| Windows (x64) | `OpenPencil.exe` |
| Windows (ARM) | `OpenPencil.exe` |
| Linux (x64) | `OpenPencil` |

## Configuration requise

OpenPencil affiche le rendu avec CanvasKit sur WebGL et s’appuie sur des fonctionnalités récentes de la plateforme web ; il faut donc un moteur de navigateur récent. L’application web prend en charge Chrome 111, Edge 111, Firefox 128 et Safari 16.4 ou version ultérieure ; les navigateurs basés sur Chromium, comme Brave et Opera, suivent leur version de Chrome. L’application de bureau est une fenêtre native Iced.

| Plateforme | Configuration requise |
| ---------- | --------------------- |
| macOS | Une version actuelle de macOS. |
| Windows | Windows 10 ou version ultérieure. |
| Linux | GTK 3 pour les boîtes de dialogue, plus libxkbcommon, Wayland et Vulkan pour compiler. |

Lorsque le moteur est trop ancien, OpenPencil indique ce qu’il faut mettre à jour au lieu d’afficher une fenêtre vide. Si cet avis apparaît sur un système conforme, utilisez son lien « Report a problem », qui préremplit les informations sur le navigateur et le moteur.

## Installation sous macOS avec Homebrew

```sh
brew install --cask openpencil
```

Cette commande installe l’application signée pour les Mac équipés d’une puce Apple Silicon ou d’un processeur Intel depuis le [catalogue officiel Homebrew](https://formulae.brew.sh/cask/openpencil). Les mises à jour sont examinées par Homebrew et peuvent arriver après les versions GitHub. En attendant, utilisez le [téléchargement direct](https://github.com/open-pencil/open-pencil/releases/latest). La CLI s’installe séparément : `npm install -g @open-pencil/cli`.

Si vous utilisiez le tap personnalisé archivé, migrez avec :

```sh
brew uninstall open-pencil/tap/open-pencil
brew install --cask openpencil
```

## Compiler le code source

### Prérequis

- [Bun](https://bun.sh/) comme runtime et package manager ;
- [Rust](https://rustup.rs/) 1.88 ou plus récent, uniquement pour l'application de bureau.

### Installation

```sh
git clone https://github.com/open-pencil/open-pencil.git
cd open-pencil
bun install
```

### Serveur de développement

```sh
bun run dev
```

L'éditeur sera accessible à l'adresse `http://localhost:1420`.

### Commandes

| Commande | Rôle |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `bun run dev` | Démarrer le serveur de développement avec HMR |
| `bun run build` | Générer la version de production |
| `bun run check` | Exécuter oxlint et vérifier les types avec tsgo |
| `bun run test` | Exécuter les tests E2E et de régression visuelle avec Playwright |
| `bun run test:update` | Mettre à jour les captures de référence |
| `bun run test:unit` | Exécuter les tests unitaires avec bun:test |
| `bun run docs:dev` | Démarrer le serveur de développement de la documentation |
| `bun run docs:build` | Générer rapidement la documentation pour la vérifier en local |
| `bun run docs:build:production` | Générer la documentation complète pour publication, y compris les fichiers destinés aux LLM |

## Application de bureau (Iced)

La fenêtre de bureau est une application native [Iced](https://iced.rs/). Elle demande Rust 1.88 ou plus récent et [Bun](https://bun.sh). Installez les dépendances, construisez les paquets, puis lancez la fenêtre depuis un checkout. La session d'édition est un processus Bun qui pilote `@open-pencil/core`.

```sh
bun install
bun run build:packages
bun run desktop
```

### Windows

Installez [Rust](https://rustup.rs/) avec le toolchain `stable-msvc` et [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) avec le workload **Desktop development with C++**, puis lancez `bun run desktop`.

### Linux

Sous Debian ou Ubuntu, installez les dépendances système :

```sh
sudo apt install pkg-config libxkbcommon-dev libwayland-dev libvulkan-dev libgtk-3-dev libssl-dev
```

Les boîtes de dialogue ont aussi besoin de GTK ou d'un portail de bureau XDG. Lancez ensuite `bun run desktop`.

### Construire pour la distribution

```sh
cd desktop && cargo build --release
```

Le binaire est `desktop/target/release/OpenPencil` (`OpenPencil.exe` sous Windows). Il démarre toujours la session d'édition avec Bun depuis ce dépôt, sauf si `OPENPENCIL_SESSION_HOST` pointe vers `packages/cli/src/desktop-session/serve.ts`.
