# OpenClient

OpenClient is a desktop Minecraft launcher suite for **Java Edition** and **Bedrock Edition**.
It is a real Electron application, not a website wrapper: it installs game files, manages Java
runtimes, launches the game, browses mods and packs, pings servers, backs up Bedrock worlds and
renders a client-side HUD through an optional companion Fabric mod.

- Public repository: <https://github.com/HappyScripterDev/OpenClient.git>
- Project website: <https://happyscripterdev.github.io/OpenClient/> ([source](website/index.html))
- Design notes: [`DESIGN_NOTES.md`](DESIGN_NOTES.md)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

OpenClient is a **performance and quality-of-life** client. It contains no x-ray, kill aura,
movement exploits, combat automation or other unfair advantages.

## Highlights

### Launcher

- Custom frameless glass window with native-style controls, titlebar, tray and splash screen.
- Microsoft sign-in gate before the workspace opens. Official OAuth device-code flow with
  browser approval, encrypted token storage through Electron `safeStorage`, silent refresh and
  Xbox Live / XSTS / Minecraft services verification.
- Java and Bedrock edition switch that adapts navigation, profiles, statistics and content.
- Settings persisted as JSON in the OS app-data directory.
- Toast notifications, skeletons, keyboard navigation, focus states and reduced-motion support.

### Java Edition

- Official Mojang version manifest: releases, snapshots and old versions.
- Parallel downloads with retry, resume, SHA-1 verification and progress reporting.
- Correct library rules, natives extraction, classpath, game/JVM arguments and per-OS handling.
- Automatic Java detection and Adoptium Temurin JRE download with SHA-256 verification.
- Fabric, Quilt, Forge and NeoForge: one-click loader installation.
- Modrinth catalog with dependency resolution, loader/version filtering, hash verification,
  author and license display, update checks and local imports.
- Optional CurseForge source with a user-provided API key.
- Performance profiles: Ultra FPS, Balanced and Quality. Data-driven mod sets, JVM presets,
  RAM recommendation, options.txt tuning with backup and restore.
- G1GC, low-latency and ZGC presets, custom arguments, per-profile memory and game directory.
- Live console, log filters, crash report viewer and profile repair.

### Client HUD

- Optional companion mod in [`companion-mod/`](companion-mod/README.md).
- Configurable FPS, CPS, ping, coordinates, keystrokes, armor and held items, real clock,
  in-game day time and JVM heap.
- Drag-to-place layout in the launcher preview and inside the game.
- Toggle sprint, hold-to-zoom, main-menu branding and Fabric API HUD rendering.
- All features are client-side quality-of-life only.

### Bedrock Edition

- Detects the Windows Store / Xbox app installation.
- Launches Bedrock and opens server deep links.
- Imports `.mcpack`, `.mcaddon`, `.mcworld` and `.mctemplate` files into `com.mojang`.
- Lists and removes resource, behavior and skin packs.
- World manager: backup, restore, duplicate, export, import and delete.
- Edits `options.txt` with graphics presets and an automatic backup.
- RakNet server ping, favorites and Java/Bedrock/Both cross-play tags.

### Bedrock limitations

Bedrock has **no official mod API**. OpenClient does not inject code, patch the executable or
pretend to load Java-style mods. Specifically:

- No custom client mods, shaders injected by third-party code, or Java loaders.
- No console/mobile data access. Bedrock management is Windows-only.
- Direct join is a `minecraft://` deep link that adds the server and opens the game; whether the
  game connects immediately depends on the installed Bedrock version.
- World and pack support works with the public `com.mojang` data folder only.
- Cross-play tags are user-maintained metadata, not guessed.

## Stack

- Electron 45
- TypeScript in strict mode
- React 19
- Vite 8 + `vite-plugin-electron`
- electron-builder for NSIS, portable, AppImage, deb and dmg
- Vitest for unit tests
- No CSS framework; one token file and hand-written component CSS
- Fabric Loom + Gradle for the companion mod (Minecraft 1.21.1, Java 21)

## Setup

```bash
npm install
npm run dev
```

Requirements:

- Node.js 22 or newer (developed on Node 24)
- Windows 10/11 for Bedrock management and the primary installer
- Java is downloaded automatically for Minecraft versions; no system Java is required

If Electron's binary was not downloaded by your npm configuration, run:

```bash
node node_modules/electron/install.js
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite, Electron main/preload and the renderer |
| `npm run build` | Type-check and build renderer, main and preload |
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | Strict TypeScript check |
| `npm run package:win` | Build the Windows NSIS installer and portable build |
| `npm run package:linux` | Build AppImage and deb |
| `npm run package:mac` | Build dmg and zip |
| `npm run package:dir` | Unpacked build for quick testing |
| `npm run icons` | Regenerate PNG/ICO assets from `assets/OcTransparent.png` |

The installer and portable build use `build/icon.ico`, generated from the transparent logo.
Only `OcTransparent.png` is used as the application mark.

## Authentication

OpenClient uses the official Microsoft identity platform device-code flow with the scopes
`XboxLive.signin offline_access`. After Microsoft approval it authenticates with Xbox Live, XSTS
and Minecraft services, verifies Java Edition ownership and encrypts the refresh token with the
operating system keychain.

A default public client ID is provided for convenience. It belongs to an open-source launcher
project and can be revoked at any time. For production distribution, register your own public
client application in Microsoft Entra and set the client ID in **Settings, Accounts** (or in the
Accounts screen). The client ID is not a secret.

OpenClient never asks for or stores your password. Telemetry is not implemented and no telemetry
is sent.

## Companion mod

See [`companion-mod/README.md`](companion-mod/README.md).

```bash
cd companion-mod
gradle build
```

Copy `build/libs/openclient-1.0.0.jar` into the profile `mods` folder. The mod requires Fabric API
and Minecraft 1.21.1 by default; adjust `gradle.properties` for other versions.

The launcher can also do it for you: open **Client HUD** and use **Install HUD**. That installs
Fabric API from Modrinth and copies the bundled OpenClient Mod jar into the profile (the launcher
never bundles third-party mods). The bundled jar targets Minecraft 1.21.1; rebuild it for other
versions.

HUD configuration is stored in `config/openclient-hud.json` inside the profile game directory.
The launcher writes the same file, so both editors stay in sync.

## Project layout

```text
electron/
  main.ts, preload.ts, windows.ts, ipc.ts
  core/          pure logic (manifest, arguments, options, ping, dependencies)
  services/      main-process services (versions, Java, launch, accounts, catalog, Bedrock, HUD)
src/
  app/           shell, titlebar, sidebar
  screens/       Home, Profiles, Mods, Packs, HUD, Servers, Accounts, Logs, Settings, Bedrock
  ui/            glass primitives, dialogs, toasts, login gate
  lib/           store, formatting, log/transfer stores
  shared/        types, IPC contract, JVM presets, performance presets, HUD schema
tests/           Vitest unit tests
companion-mod/   independent Fabric mod project
website/         static project website in the Liner-inspired design language
build/           generated installer icons and tray image
```

## Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- No raw `ipcRenderer` or `require` exposed to the renderer.
- Access tokens are redacted from logs and never written to plain-text JSON.
- Downloads are verified with SHA-1, SHA-256 or SHA-512 depending on the source.
- The renderer cannot read arbitrary files outside the OpenClient data folders through the log API.
- External links are limited to http/https.

## License

MIT for the OpenClient source. Minecraft is a trademark of Mojang Synergies AB. OpenClient is not
affiliated with Mojang or Microsoft. Mods, resource packs and shaders keep their own licenses and
are downloaded from their official catalogs at runtime.
