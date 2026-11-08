export type Edition = "java" | "bedrock";

export type LoaderType = "vanilla" | "fabric" | "quilt" | "forge" | "neoforge";

export type JvmPresetId =
  | "g1-balanced"
  | "g1-performance"
  | "zgc"
  | "low-latency"
  | "custom";

export type PerformancePresetId = "ultra" | "balanced" | "quality";

export type ContentKind = "mod" | "resourcepack" | "shader";

export type ContentSource = "modrinth" | "curseforge" | "local";

export type ThemeMode = "dark" | "midnight";

export type LanguageCode = "en" | "de";

export interface InstalledContent {
  id: string;
  kind: ContentKind;
  source: ContentSource;
  projectId: string;
  slug: string;
  name: string;
  author: string;
  license: string;
  versionId: string;
  versionNumber: string;
  fileName: string;
  gameVersions: string[];
  loaders: string[];
  enabled: boolean;
  sizeBytes: number;
  installedAt: number;
  updateVersionId?: string;
  updateVersionNumber?: string;
}

export interface JavaProfile {
  id: string;
  edition: "java";
  name: string;
  gameVersion: string;
  loader: LoaderType;
  loaderVersion?: string;
  loaderVersionId?: string;
  memoryMb: number;
  jvmPreset: JvmPresetId;
  customJvmArgs: string[];
  gameDir: string;
  javaPath?: string;
  performancePreset?: PerformancePresetId;
  mods: InstalledContent[];
  resourcePacks: InstalledContent[];
  shaderPacks: InstalledContent[];
  createdAt: number;
  updatedAt: number;
  lastPlayed?: number;
}

export interface BedrockProfile {
  id: string;
  edition: "bedrock";
  name: string;
  gameDir: string;
  createdAt: number;
  updatedAt: number;
  lastPlayed?: number;
}

export type Profile = JavaProfile | BedrockProfile;

export interface ServerEntry {
  id: string;
  name: string;
  address: string;
  port: number;
  edition: Edition | "both";
  crossPlay: "java" | "bedrock" | "both" | "unknown";
  favorite: boolean;
  notes: string;
  addedAt: number;
  lastPlayed?: number;
}

export interface ServerPingResult {
  online: boolean;
  edition: Edition;
  address: string;
  port: number;
  latencyMs: number;
  motd: string;
  version: string;
  playersOnline: number;
  playersMax: number;
  playerSample: string[];
  iconDataUrl?: string;
  checkedAt: number;
  error?: string;
}

export interface AccountSummary {
  id: string;
  username: string;
  uuid: string;
  active: boolean;
  addedAt: number;
}

export interface AccountProfile {
  id: string;
  name: string;
  skins: { id: string; state: string; url: string }[];
  capes: string[];
}

export interface DeviceCodeChallenge {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
}

export interface AppSettings {
  schemaVersion: number;
  language: LanguageCode;
  theme: ThemeMode;
  accent: string;
  reduceMotion: boolean;
  compactSidebar: boolean;
  closeToTray: boolean;
  minimizeToTray: boolean;
  launchOnStartup: boolean;
  autoCheckUpdates: boolean;
  updateFeedUrl: string;
  telemetry: boolean;
  catalogSource: "modrinth" | "both";
  curseforgeApiKey: string;
  microsoftClientId: string;
  defaultEdition: Edition;
  selectedJavaProfileId: string;
  selectedBedrockProfileId: string;
  memoryMb: number;
  jvmPreset: JvmPresetId;
  javaPath: string;
  dataRoot: string;
  bedrockGameDir: string;
  downloadConcurrency: number;
  keepLauncherOpen: boolean;
  showSnapshots: boolean;
  confirmOnExit: boolean;
  lastNewsSeenAt: number;
  eulaAccepted: boolean;
}

export interface MojangVersionSummary {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  releaseTime: string;
  url: string;
}

export interface JavaRuntimeInfo {
  path: string;
  version: string;
  major: number;
  source: "system" | "managed";
  vendor: string;
}

export interface ManagedRuntimeInfo {
  major: number;
  path: string;
  version: string;
  installedAt: number;
  sizeBytes: number;
}

export interface DownloadProgress {
  jobId: string;
  stage: string;
  label: string;
  completed: number;
  total: number;
  bytesReceived: number;
  bytesTotal: number;
  filesDone: number;
  filesTotal: number;
  done: boolean;
  error?: string;
}

export interface LaunchResult {
  pid: number;
  command: string;
  startedAt: number;
}

export interface GameProcessState {
  running: boolean;
  pid?: number;
  profileId?: string;
  startedAt?: number;
  exitCode?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  publishedAt: string;
  imageUrl?: string;
  url: string;
}

export interface ServiceStatusEntry {
  id: string;
  name: string;
  state: "up" | "degraded" | "down" | "unknown";
  detail: string;
}

export interface CatalogProject {
  id: string;
  source: ContentSource;
  kind: ContentKind;
  slug: string;
  name: string;
  summary: string;
  author: string;
  license: string;
  downloads: number;
  followers: number;
  iconUrl?: string;
  updatedAt: string;
  categories: string[];
  gameVersions: string[];
  loaders: string[];
  externalUrl?: string;
}

export interface CatalogVersion {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  downloads: number;
  publishedAt: string;
  fileName: string;
  downloadUrl: string;
  hashAlgo: "sha1" | "sha512" | "md5";
  hash: string;
  size?: number;
  dependencies: { projectId: string; versionId?: string; kind: string }[];
  changelog?: string;
}

export interface CatalogSearchQuery {
  query: string;
  kind: ContentKind;
  gameVersion?: string;
  loader?: string;
  offset?: number;
  limit?: number;
  source?: "modrinth" | "curseforge";
  sort?: "relevance" | "downloads" | "updated" | "newest";
}

export interface CatalogSearchResult {
  projects: CatalogProject[];
  total: number;
  offset: number;
  source: ContentSource;
}

export interface DependencyPlanEntry {
  projectId: string;
  title: string;
  required: boolean;
  version?: CatalogVersion;
  state: "resolved" | "missing" | "conflict";
  reason?: string;
}

export interface InstallPlan {
  rootProjectId: string;
  entries: DependencyPlanEntry[];
  warnings: string[];
}

export interface PerformancePresetDefinition {
  id: PerformancePresetId;
  name: string;
  tagline: string;
  description: string;
  jvmPreset: JvmPresetId;
  mods: { slug: string; optional: boolean; kind: ContentKind; note: string }[];
  options: Record<string, string | number | boolean>;
  minGameVersion: string;
  maxGameVersion?: string;
}

export interface PerformanceApplyResult {
  installed: string[];
  skipped: { slug: string; reason: string }[];
  failed: { slug: string; reason: string }[];
  optionsBackupPath?: string;
}

export interface BedrockStatus {
  supported: boolean;
  platform: string;
  installed: boolean;
  version?: string;
  packageFamilyName?: string;
  installPath?: string;
  gameDir?: string;
  launcherUri: string;
  notes: string[];
}

export interface BedrockContentEntry {
  id: string;
  name: string;
  kind: "resource" | "behavior" | "skin" | "world" | "template" | "renderer";
  path: string;
  sizeBytes: number;
  packed: boolean;
  iconPath?: string;
  iconDataUrl?: string;
  uuid?: string;
  version?: string;
}

export interface BedrockWorldEntry {
  id: string;
  name: string;
  folder: string;
  path: string;
  sizeBytes: number;
  lastModified: number;
  gameMode?: string;
  version?: string;
  iconDataUrl?: string;
  hasBackup: boolean;
}

export interface BedrockOptionEntry {
  key: string;
  value: string;
  label: string;
  group: "performance" | "visual" | "gameplay" | "other";
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error" | "game" | "debug";
  source: string;
  message: string;
}

export interface CrashReportInfo {
  id: string;
  fileName: string;
  path: string;
  modifiedAt: number;
  sizeBytes: number;
  preview: string;
}

export interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "error" | "not-configured";
  version?: string;
  percent?: number;
  message?: string;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  dataRoot: string;
  isPackaged: boolean;
  electron: string;
  chrome: string;
  node: string;
}

export type ErrorCode =
  | "OFFLINE"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "DOWNLOAD_FAILED"
  | "CHECKSUM_FAILED"
  | "JAVA_MISSING"
  | "UNSUPPORTED"
  | "CORRUPT"
  | "CANCELLED"
  | "EULA_REQUIRED"
  | "INTERNAL";

export interface AppError {
  code: ErrorCode;
  message: string;
  detail?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: AppError };
