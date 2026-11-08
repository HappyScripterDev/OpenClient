import { contextBridge, ipcRenderer } from "electron";
import type { HudConfig } from "../src/shared/hud";
import type {
  AccountSummary,
  ApiResult,
  AppInfo,
  AppSettings,
  BedrockContentEntry,
  BedrockOptionEntry,
  BedrockStatus,
  BedrockWorldEntry,
  CatalogProject,
  CatalogSearchQuery,
  CatalogSearchResult,
  CatalogVersion,
  CrashReportInfo,
  DeviceCodeChallenge,
  DownloadProgress,
  GameProcessState,
  InstallPlan,
  InstalledContent,
  JavaRuntimeInfo,
  LaunchResult,
  LogEntry,
  ManagedRuntimeInfo,
  MojangVersionSummary,
  NewsItem,
  PerformanceApplyResult,
  PerformancePresetId,
  Profile,
  ServerEntry,
  ServerPingResult,
  ServiceStatusEntry,
  UpdateState,
} from "../src/shared/types";
import type {
  AuthFlowStatus,
  OpenClientApi,
  WindowState,
} from "../src/shared/ipc";

function invoke<T>(channel: string, ...args: unknown[]): Promise<ApiResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<ApiResult<T>>;
}

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T): void => {
    listener(value);
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: OpenClientApi = {
  app: {
    info: () => invoke<AppInfo>("app:info"),
    openExternal: (url) => invoke<null>("app:open-external", url),
    openPath: (path) => invoke<null>("app:open-path", path),
    pickDirectory: (title, defaultPath) =>
      invoke<string | null>("app:pick-directory", title, defaultPath),
    pickFile: (title, filters) =>
      invoke<string | null>("app:pick-file", title, filters),
    pickFiles: (title, filters) =>
      invoke<string[]>("app:pick-files", title, filters),
    revealPath: (path) => invoke<null>("app:reveal-path", path),
    systemMemory: () => invoke<{ totalMb: number; freeMb: number }>("app:system-memory"),
    window: {
      minimize: () => invoke<null>("window:minimize"),
      toggleMaximize: () => invoke<WindowState>("window:toggle-maximize"),
      close: () => invoke<null>("window:close"),
      quit: () => invoke<null>("app:quit"),
      getState: () => invoke<WindowState>("window:get-state"),
      onState: (listener) => subscribe<WindowState>("event:window-state", listener),
    },
  },
  settings: {
    get: () => invoke<AppSettings>("settings:get"),
    update: (patch) => invoke<AppSettings>("settings:update", patch),
  },
  profiles: {
    list: () => invoke<Profile[]>("profiles:list"),
    create: (input) => invoke<Profile>("profiles:create", input),
    update: (id, patch) => invoke<Profile>("profiles:update", id, patch),
    remove: (id) => invoke<null>("profiles:remove", id),
    duplicate: (id) => invoke<Profile>("profiles:duplicate", id),
  },
  auth: {
    list: () => invoke<AccountSummary[]>("auth:list"),
    startDeviceCode: (clientId) =>
      invoke<DeviceCodeChallenge>("auth:start-device-code", clientId),
    cancelDeviceCode: () => invoke<null>("auth:cancel-device-code"),
    signOut: (id) => invoke<null>("auth:sign-out", id),
    setActive: (id) => invoke<AccountSummary[]>("auth:set-active", id),
    refresh: (id) => invoke<AccountSummary[]>("auth:refresh", id),
  },
  java: {
    versions: (includeSnapshots) =>
      invoke<MojangVersionSummary[]>("java:versions", includeSnapshots),
    latestVersion: () =>
      invoke<{ release: string; snapshot: string }>("java:latest-version"),
    loaderVersions: (loader, gameVersion) =>
      invoke<string[]>("java:loader-versions", loader, gameVersion),
    installLoader: (profileId, loader, loaderVersion) =>
      invoke<null>("java:install-loader", profileId, loader, loaderVersion),
    runtimes: () =>
      invoke<{ managed: ManagedRuntimeInfo[]; system: JavaRuntimeInfo[] }>("java:runtimes"),
    downloadRuntime: (major) =>
      invoke<ManagedRuntimeInfo>("java:download-runtime", major),
    detectRuntime: (major) =>
      invoke<JavaRuntimeInfo>("java:detect-runtime", major),
    prepare: (profileId) => invoke<null>("java:prepare", profileId),
    launch: (profileId, options) =>
      invoke<LaunchResult>("java:launch", profileId, options),
    stop: () => invoke<null>("java:stop"),
    processState: () => invoke<GameProcessState>("java:process-state"),
    repair: (profileId) => invoke<null>("java:repair", profileId),
  },
  catalog: {
    search: (query: CatalogSearchQuery) =>
      invoke<CatalogSearchResult>("catalog:search", query),
    project: (source, id, kind) =>
      invoke<CatalogProject>("catalog:project", source, id, kind),
    versions: (source, projectId, gameVersion, loader, kind) =>
      invoke<CatalogVersion[]>(
        "catalog:versions",
        source,
        projectId,
        gameVersion,
        loader,
        kind,
      ),
    plan: (profileId, source, projectId, kind) =>
      invoke<InstallPlan>("catalog:plan", profileId, source, projectId, kind),
    install: (profileId, source, versionId, kind) =>
      invoke<InstalledContent>("catalog:install", profileId, source, versionId, kind),
  },
  content: {
    list: (profileId) => invoke<InstalledContent[]>("content:list", profileId),
    remove: (profileId, contentId) =>
      invoke<null>("content:remove", profileId, contentId),
    toggle: (profileId, contentId, enabled) =>
      invoke<InstalledContent>("content:toggle", profileId, contentId, enabled),
    checkUpdates: (profileId) =>
      invoke<InstalledContent[]>("content:check-updates", profileId),
    update: (profileId, contentId) =>
      invoke<InstalledContent>("content:update", profileId, contentId),
    importLocal: (profileId, kind, paths) =>
      invoke<InstalledContent[]>("content:import-local", profileId, kind, paths),
    openFolder: (profileId, kind) =>
      invoke<null>("content:open-folder", profileId, kind),
  },
  hud: {
    get: (profileId) => invoke<HudConfig>("hud:get", profileId),
    save: (profileId, config) => invoke<HudConfig>("hud:save", profileId, config),
  },
  performance: {
    apply: (profileId, preset) =>
      invoke<PerformanceApplyResult>("performance:apply", profileId, preset as PerformancePresetId),
    optionsSnapshot: (profileId) =>
      invoke<Record<string, string>>("performance:options-snapshot", profileId),
    restoreOptions: (profileId) =>
      invoke<null>("performance:restore-options", profileId),
  },
  servers: {
    list: () => invoke<ServerEntry[]>("servers:list"),
    add: (input) => invoke<ServerEntry>("servers:add", input),
    update: (id, patch) => invoke<ServerEntry>("servers:update", id, patch),
    remove: (id) => invoke<null>("servers:remove", id),
    ping: (id) => invoke<ServerPingResult>("servers:ping", id),
    pingAddress: (edition, address, port) =>
      invoke<ServerPingResult>("servers:ping-address", edition, address, port),
    join: (id, profileId) =>
      invoke<LaunchResult | null>("servers:join", id, profileId),
  },
  bedrock: {
    status: () => invoke<BedrockStatus>("bedrock:status"),
    launch: (uri) => invoke<null>("bedrock:launch", uri),
    content: () => invoke<BedrockContentEntry[]>("bedrock:content"),
    importContent: (paths) => invoke<BedrockContentEntry[]>("bedrock:import-content", paths),
    removeContent: (id) => invoke<null>("bedrock:remove-content", id),
    worlds: () => invoke<BedrockWorldEntry[]>("bedrock:worlds"),
    importWorld: (path) => invoke<BedrockWorldEntry>("bedrock:import-world", path),
    backupWorld: (id) => invoke<string>("bedrock:backup-world", id),
    restoreWorld: (id) => invoke<null>("bedrock:restore-world", id),
    duplicateWorld: (id) => invoke<BedrockWorldEntry>("bedrock:duplicate-world", id),
    exportWorld: (id) => invoke<string | null>("bedrock:export-world", id),
    deleteWorld: (id) => invoke<null>("bedrock:delete-world", id),
    options: () => invoke<BedrockOptionEntry[]>("bedrock:options"),
    setOption: (key, value) =>
      invoke<BedrockOptionEntry[]>("bedrock:set-option", key, value),
    applyPreset: (preset) =>
      invoke<BedrockOptionEntry[]>("bedrock:apply-preset", preset),
    restoreOptions: () => invoke<BedrockOptionEntry[]>("bedrock:restore-options"),
  },
  logs: {
    list: () => invoke<LogEntry[]>("logs:list"),
    clear: () => invoke<null>("logs:clear"),
    crashReports: () => invoke<CrashReportInfo[]>("logs:crash-reports"),
    readCrash: (path) => invoke<string>("logs:read-crash", path),
    openLogsFolder: () => invoke<null>("logs:open-folder"),
    openCrashFolder: () => invoke<null>("logs:open-crash-folder"),
  },
  news: {
    news: () => invoke<NewsItem[]>("news:list"),
    statuses: () => invoke<ServiceStatusEntry[]>("news:statuses"),
  },
  updater: {
    state: () => invoke<UpdateState>("updater:state"),
    check: () => invoke<UpdateState>("updater:check"),
    download: () => invoke<UpdateState>("updater:download"),
    install: () => invoke<null>("updater:install"),
  },
  events: {
    onProgress: (listener) => subscribe<DownloadProgress>("event:progress", listener),
    onLog: (listener) => subscribe<LogEntry>("event:log", listener),
    onGameState: (listener) => subscribe<GameProcessState>("event:game-state", listener),
    onDeviceCode: (listener) =>
      subscribe<DeviceCodeChallenge>("event:device-code", listener),
    onAuthStatus: (listener) => subscribe<AuthFlowStatus>("event:auth-status", listener),
    onAuthChanged: (listener) =>
      subscribe<AccountSummary[]>("event:auth-changed", listener),
    onUpdateState: (listener) => subscribe<UpdateState>("event:update-state", listener),
    onProfilesChanged: (listener) =>
      subscribe<Profile[]>("event:profiles-changed", listener),
  },
};

contextBridge.exposeInMainWorld("openclient", Object.freeze(api));
