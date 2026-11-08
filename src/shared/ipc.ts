import type { HudConfig } from "./hud";
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
  JavaProfile,
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
} from "./types";

export interface AuthFlowStatus {
  state: "pending" | "success" | "error" | "cancelled";
  message: string;
  account?: AccountSummary;
}

export interface WindowState {
  maximized: boolean;
  focused: boolean;
  fullscreen: boolean;
}

export interface WindowApi {
  minimize(): Promise<ApiResult<null>>;
  toggleMaximize(): Promise<ApiResult<WindowState>>;
  close(): Promise<ApiResult<null>>;
  quit(): Promise<ApiResult<null>>;
  getState(): Promise<ApiResult<WindowState>>;
  onState(listener: (state: WindowState) => void): () => void;
}

export interface AppApi {
  info(): Promise<ApiResult<AppInfo>>;
  openExternal(url: string): Promise<ApiResult<null>>;
  openPath(path: string): Promise<ApiResult<null>>;
  pickDirectory(title: string, defaultPath?: string): Promise<ApiResult<string | null>>;
  pickFile(
    title: string,
    filters?: { name: string; extensions: string[] }[],
  ): Promise<ApiResult<string | null>>;
  pickFiles(
    title: string,
    filters?: { name: string; extensions: string[] }[],
  ): Promise<ApiResult<string[]>>;
  revealPath(path: string): Promise<ApiResult<null>>;
  systemMemory(): Promise<ApiResult<{ totalMb: number; freeMb: number }>>;
  window: WindowApi;
}

export interface SettingsApi {
  get(): Promise<ApiResult<AppSettings>>;
  update(patch: Partial<AppSettings>): Promise<ApiResult<AppSettings>>;
}

export interface ProfilesApi {
  list(): Promise<ApiResult<Profile[]>>;
  create(input: {
    name: string;
    edition: "java" | "bedrock";
    gameVersion?: string;
    loader?: JavaProfile["loader"];
  }): Promise<ApiResult<Profile>>;
  update(id: string, patch: Partial<JavaProfile> & Partial<Profile>): Promise<ApiResult<Profile>>;
  remove(id: string): Promise<ApiResult<null>>;
  duplicate(id: string): Promise<ApiResult<Profile>>;
}

export interface AuthApi {
  list(): Promise<ApiResult<AccountSummary[]>>;
  startDeviceCode(clientId?: string): Promise<ApiResult<DeviceCodeChallenge>>;
  cancelDeviceCode(): Promise<ApiResult<null>>;
  signOut(id: string): Promise<ApiResult<null>>;
  setActive(id: string): Promise<ApiResult<AccountSummary[]>>;
  refresh(id: string): Promise<ApiResult<AccountSummary[]>>;
}

export interface JavaApi {
  versions(includeSnapshots: boolean): Promise<ApiResult<MojangVersionSummary[]>>;
  latestVersion(): Promise<ApiResult<{ release: string; snapshot: string }>>;
  loaderVersions(
    loader: "fabric" | "quilt" | "forge" | "neoforge",
    gameVersion: string,
  ): Promise<ApiResult<string[]>>;
  installLoader(
    profileId: string,
    loader: "fabric" | "quilt" | "forge" | "neoforge",
    loaderVersion?: string,
  ): Promise<ApiResult<null>>;
  runtimes(): Promise<ApiResult<{ managed: ManagedRuntimeInfo[]; system: JavaRuntimeInfo[] }>>;
  downloadRuntime(major: number): Promise<ApiResult<ManagedRuntimeInfo>>;
  detectRuntime(major: number): Promise<ApiResult<JavaRuntimeInfo>>;
  prepare(profileId: string): Promise<ApiResult<null>>;
  launch(
    profileId: string,
    options?: { server?: string; port?: number },
  ): Promise<ApiResult<LaunchResult>>;
  stop(): Promise<ApiResult<null>>;
  processState(): Promise<ApiResult<GameProcessState>>;
  repair(profileId: string): Promise<ApiResult<null>>;
}

export interface CatalogApi {
  search(query: CatalogSearchQuery): Promise<ApiResult<CatalogSearchResult>>;
  project(
    source: "modrinth" | "curseforge",
    id: string,
    kind: InstalledContent["kind"],
  ): Promise<ApiResult<CatalogProject>>;
  versions(
    source: "modrinth" | "curseforge",
    projectId: string,
    gameVersion: string,
    loader: string,
    kind: InstalledContent["kind"],
  ): Promise<ApiResult<CatalogVersion[]>>;
  plan(
    profileId: string,
    source: "modrinth" | "curseforge",
    projectId: string,
    kind: InstalledContent["kind"],
  ): Promise<ApiResult<InstallPlan>>;
  install(
    profileId: string,
    source: "modrinth" | "curseforge",
    versionId: string,
    kind: InstalledContent["kind"],
  ): Promise<ApiResult<InstalledContent>>;
}

export interface HudApi {
  get(profileId: string): Promise<ApiResult<HudConfig>>;
  save(profileId: string, config: Partial<HudConfig>): Promise<ApiResult<HudConfig>>;
  install(profileId: string): Promise<ApiResult<{ installed: string[]; jarPath: string }>>;
}

export interface ContentApi {
  list(profileId: string): Promise<ApiResult<InstalledContent[]>>;
  remove(profileId: string, contentId: string): Promise<ApiResult<null>>;
  toggle(profileId: string, contentId: string, enabled: boolean): Promise<ApiResult<InstalledContent>>;
  checkUpdates(profileId: string): Promise<ApiResult<InstalledContent[]>>;
  update(profileId: string, contentId: string): Promise<ApiResult<InstalledContent>>;
  importLocal(
    profileId: string,
    kind: InstalledContent["kind"],
    paths: string[],
  ): Promise<ApiResult<InstalledContent[]>>;
  openFolder(profileId: string, kind: InstalledContent["kind"]): Promise<ApiResult<null>>;
}

export interface PerformanceApi {
  apply(profileId: string, preset: PerformancePresetId): Promise<ApiResult<PerformanceApplyResult>>;
  optionsSnapshot(profileId: string): Promise<ApiResult<Record<string, string>>>;
  restoreOptions(profileId: string): Promise<ApiResult<null>>;
}

export interface ServersApi {
  list(): Promise<ApiResult<ServerEntry[]>>;
  add(input: Omit<ServerEntry, "id" | "addedAt">): Promise<ApiResult<ServerEntry>>;
  update(id: string, patch: Partial<ServerEntry>): Promise<ApiResult<ServerEntry>>;
  remove(id: string): Promise<ApiResult<null>>;
  ping(id: string): Promise<ApiResult<ServerPingResult>>;
  pingAddress(edition: "java" | "bedrock", address: string, port: number): Promise<ApiResult<ServerPingResult>>;
  join(id: string, profileId?: string): Promise<ApiResult<LaunchResult | null>>;
}

export interface BedrockApi {
  status(): Promise<ApiResult<BedrockStatus>>;
  launch(uri?: string): Promise<ApiResult<null>>;
  content(): Promise<ApiResult<BedrockContentEntry[]>>;
  importContent(paths: string[]): Promise<ApiResult<BedrockContentEntry[]>>;
  removeContent(id: string): Promise<ApiResult<null>>;
  worlds(): Promise<ApiResult<BedrockWorldEntry[]>>;
  importWorld(path: string): Promise<ApiResult<BedrockWorldEntry>>;
  backupWorld(id: string): Promise<ApiResult<string>>;
  restoreWorld(id: string): Promise<ApiResult<null>>;
  duplicateWorld(id: string): Promise<ApiResult<BedrockWorldEntry>>;
  exportWorld(id: string): Promise<ApiResult<string | null>>;
  deleteWorld(id: string): Promise<ApiResult<null>>;
  options(): Promise<ApiResult<BedrockOptionEntry[]>>;
  setOption(key: string, value: string): Promise<ApiResult<BedrockOptionEntry[]>>;
  applyPreset(preset: "performance" | "balanced" | "quality"): Promise<ApiResult<BedrockOptionEntry[]>>;
  restoreOptions(): Promise<ApiResult<BedrockOptionEntry[]>>;
}

export interface LogsApi {
  list(): Promise<ApiResult<LogEntry[]>>;
  clear(): Promise<ApiResult<null>>;
  crashReports(): Promise<ApiResult<CrashReportInfo[]>>;
  readCrash(path: string): Promise<ApiResult<string>>;
  openLogsFolder(): Promise<ApiResult<null>>;
  openCrashFolder(): Promise<ApiResult<null>>;
}

export interface NewsApi {
  news(): Promise<ApiResult<NewsItem[]>>;
  statuses(): Promise<ApiResult<ServiceStatusEntry[]>>;
}

export interface UpdaterApi {
  state(): Promise<ApiResult<UpdateState>>;
  check(): Promise<ApiResult<UpdateState>>;
  download(): Promise<ApiResult<UpdateState>>;
  install(): Promise<ApiResult<null>>;
}

export interface OpenClientEvents {
  onProgress(listener: (progress: DownloadProgress) => void): () => void;
  onLog(listener: (entry: LogEntry) => void): () => void;
  onGameState(listener: (state: GameProcessState) => void): () => void;
  onDeviceCode(listener: (challenge: DeviceCodeChallenge) => void): () => void;
  onAuthStatus(listener: (status: AuthFlowStatus) => void): () => void;
  onAuthChanged(listener: (accounts: AccountSummary[]) => void): () => void;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
  onProfilesChanged(listener: (profiles: Profile[]) => void): () => void;
}

export interface OpenClientApi {
  app: AppApi;
  settings: SettingsApi;
  profiles: ProfilesApi;
  auth: AuthApi;
  java: JavaApi;
  catalog: CatalogApi;
  content: ContentApi;
  hud: HudApi;
  performance: PerformanceApi;
  servers: ServersApi;
  bedrock: BedrockApi;
  logs: LogsApi;
  news: NewsApi;
  updater: UpdaterApi;
  events: OpenClientEvents;
}
