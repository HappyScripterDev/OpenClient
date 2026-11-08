# OpenClient Architecture

## Stack

- Electron 45 (main process, preload, renderer)
- TypeScript strict mode everywhere
- React 19 renderer, bundled by Vite 8
- Vite plugin `vite-plugin-electron` for main/preload builds and dev reload
- electron-builder for NSIS, portable, AppImage, deb, dmg
- Vitest for pure-logic unit tests
- No CSS framework; one central token file and hand-written component CSS
- JSON persistence in the OS app-data directory; tokens encrypted through Electron
  `safeStorage` (never plain text)

## Process layout

```
electron/
  main.ts                  application bootstrap, window, tray, IPC registration
  preload.ts               contextBridge API, no Node exposed to the renderer
  windows.ts               main window, splash, window state persistence
  ipc/                     thin IPC handlers grouped by domain
  core/                    pure logic with no Electron import (unit tested)
  services/                stateful main-process services
src/
  shared/                  types shared by renderer and main
  ui/                      primitives (button, panel, field, tabs, switch, toast...)
  app/                     shell, routing, store, titlebar, sidebar
  screens/                 feature screens
  styles/                  tokens.css + global.css
tests/                     Vitest specs for core logic
companion-mod/             independent Fabric mod (Gradle project)
```

Import rule: `electron/core` may not import `electron/services` or Electron.
`electron/services` may import core. `src/shared` is dependency-free.
`src` (renderer) never imports from `electron/`.

## Data root

```
%APPDATA%/OpenClient/
  settings.json
  profiles.json
  servers.json
  accounts.json            public account metadata only
  accounts.enc             encrypted refresh/access tokens
  logs/launcher.log
  data/
    versions/              Mojang version json + per-version folders
    libraries/
    assets/                indexes + objects
    runtimes/              managed Java runtimes
    instances/<profile>/   gameDir per profile
      mods/ resourcepacks/ shaderpacks/ saves/ options.txt logs/ crash-reports/
```

## Core services

- `SettingsService` - schema-migrated settings document, atomic writes.
- `ProfileService` - CRUD, duplicate, edition and loader validation.
- `AccountService` - Microsoft OAuth device code + refresh, Xbox Live + XSTS +
  Minecraft services chain, encrypted token store, public metadata list.
- `VersionService` - Mojang manifest cache, version JSON parsing, inheritance.
- `DownloadService` - bounded concurrency, retry with backoff, resume for large
  files, SHA-1/SHA-512 verification, progress events.
- `JavaService` - detection (PATH, registry, common installs), Adoptium runtime
  lookup/download/extract, per-version selection.
- `LaunchService` - arguments/classpath/natives assembly, options tuning, spawn,
  log streaming, exit reporting.
- `LoaderService` - Fabric/Quilt meta profiles, Forge/NeoForge installer flow.
- `ModrinthService`, `CurseForgeService` - search, versions, dependency resolution,
  hash verification, update checks.
- `PerformanceService` - data-driven presets, mod resolution per version/loader,
  options.txt patching, JVM argument presets.
- `BedrockService` - install detection, deep-link launch, content import into
  com.mojang, world backup/restore/duplicate/export, options patching, RakNet ping.
- `ServerService` - Java Server List Ping and Bedrock RakNet ping, favorites,
  cross-play metadata, join routing.
- `NewsService` - Mojang status + launcher content, cached with offline fallback.
- `UpdaterService` - electron-updater with opt-in automatic checks.
- `LogService` - launcher log, game log capture, crash report discovery.

## IPC contract

The preload exposes a single frozen object `window.openclient` with typed
namespaces (`app`, `settings`, `profiles`, `auth`, `java`, `content`, `servers`,
`bedrock`, `logs`, `news`, `updater`). Every handler returns
`{ ok: true, data }` or `{ ok: false, error: { code, message, detail? } }`.
Long-running operations emit progress over the `events` channel with a
correlation id. No raw `ipcRenderer` and no unrestricted `require` reach the
renderer.

## Milestones

1. Foundation - repository, build, design tokens, window shell, titlebar,
   navigation, theme, splash, tray, packaging config.
2. Core shell - settings, profiles, accounts screen, home, editable state,
   offline-safe errors.
3. Java engine - version manifest/downloads, Java runtime, arguments, launch,
   console and crash reports.
4. Loaders and content - Fabric/Quilt/Forge/NeoForge, Modrinth/CurseForge,
   mods, resource packs, shaders, updates, dependency resolution.
5. Performance - presets, data-driven mod sets, options.txt tuning, JVM presets,
   RAM recommendation.
6. Bedrock - detection, launch, content import, worlds, options, servers,
   limits explanation and edition-aware UI.
7. Companion mod, auto-update, tests, installers, README, final verification.

## Final additions

- Login gate blocks the workspace until a Microsoft account is active. The device-code challenge
  is opened automatically in the system browser and the gate reacts to auth events.
- HUD configuration is shared between the launcher and the companion mod through
  `config/openclient-hud.json` in each Java profile. The launcher exposes a drag preview; the
  companion mod exposes the same drag editor in game.
- The public website is a standalone static site in `website/` using the final design tokens.
- Companion mod lives in `companion-mod/` and is built independently with Gradle and Fabric Loom.
