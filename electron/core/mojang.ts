import os from "node:os";

export interface RuleOS {
  name?: string;
  version?: string;
  arch?: string;
}

export interface Rule {
  action: "allow" | "disallow";
  os?: RuleOS;
  features?: Record<string, boolean>;
}

export interface LibraryDownload {
  path?: string;
  sha1?: string;
  size?: number;
  url?: string;
}

export interface Library {
  name: string;
  rules?: Rule[];
  natives?: Record<string, string>;
  extract?: { exclude?: string[] };
  downloads?: {
    artifact?: LibraryDownload;
    classifiers?: Record<string, LibraryDownload>;
  };
}

export interface VersionDownload {
  url: string;
  sha1?: string;
  size?: number;
  path?: string;
}

export interface AssetIndex {
  id: string;
  sha1?: string;
  size?: number;
  totalSize?: number;
  url: string;
}

export interface LoggingFile {
  id: string;
  sha1?: string;
  size?: number;
  url: string;
}

export interface VersionJson {
  id: string;
  type: string;
  mainClass: string;
  inheritsFrom?: string;
  assets?: string;
  assetIndex?: AssetIndex;
  downloads?: { client?: VersionDownload; server?: VersionDownload };
  libraries?: Library[];
  arguments?: {
    game?: (string | Record<string, unknown>)[];
    jvm?: (string | Record<string, unknown>)[];
  };
  minecraftArguments?: string;
  logging?: {
    client?: {
      argument: string;
      file: LoggingFile;
      type: string;
    };
  };
  javaVersion?: { component: string; majorVersion: number };
  complianceLevel?: number;
  releaseTime?: string;
  time?: string;
  minimumLauncherVersion?: number;
}

export interface LaunchContext {
  gameDir: string;
  assetsRoot: string;
  assetsIndexName: string;
  nativesDir: string;
  libraryRoot: string;
  classpath: string;
  classpathSeparator: string;
  authPlayerName: string;
  authUuid: string;
  authAccessToken: string;
  authXuid: string;
  clientId: string;
  userType: string;
  versionName: string;
  versionType: string;
  launcherName: string;
  launcherVersion: string;
  resolutionWidth?: number;
  resolutionHeight?: number;
  features?: Record<string, boolean>;
  javaMajor: number;
}

export type MergedVersion = VersionJson;

const DEFAULT_FEATURES: Record<string, boolean> = {
  is_demo_user: false,
  has_custom_resolution: false,
  has_quick_plays_support: false,
  is_quick_play_singleplayer: false,
  is_quick_play_multiplayer: false,
  is_quick_play_realms: false,
};

export function mapOsName(platform: NodeJS.Platform): string {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "osx";
  return "linux";
}

export function mapOsArch(arch: string): string {
  if (arch === "x64") return "x86_64";
  if (arch === "arm64") return "arm64";
  if (arch === "ia32") return "x86";
  return arch;
}

export function evaluateRules(
  rules: Rule[] | undefined,
  platform: string,
  arch: string,
  osVersion: string,
  features: Record<string, boolean> = DEFAULT_FEATURES,
): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    let matches = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== platform) matches = false;
      if (rule.os.arch && rule.os.arch !== arch) matches = false;
      if (rule.os.version && matches) {
        try {
          if (!new RegExp(rule.os.version).test(osVersion)) matches = false;
        } catch {
          matches = false;
        }
      }
    }
    if (rule.features && matches) {
      for (const [key, value] of Object.entries(rule.features)) {
        if ((features[key] ?? false) !== value) {
          matches = false;
          break;
        }
      }
    }
    if (matches) {
      allowed = rule.action === "allow";
    }
  }
  return allowed;
}

export interface LibraryPlan {
  classpath: string[];
  nativeArchives: { path: string; exclude: string[] }[];
}

export function planLibraries(
  libraries: Library[],
  platform: string,
  arch: string,
  osVersion: string,
  features: Record<string, boolean> = DEFAULT_FEATURES,
): LibraryPlan {
  const classpath: string[] = [];
  const nativeArchives: { path: string; exclude: string[] }[] = [];
  const seenArtifacts = new Set<string>();
  for (const library of libraries) {
    if (!evaluateRules(library.rules, platform, arch, osVersion, features)) {
      continue;
    }
    const isNativeByName = /:natives-|:natives$/.test(library.name);
    const legacyClassifier = library.natives?.[platform]?.replace(
      "${arch}",
      arch === "x86_64" || arch === "64" ? "64" : "32",
    );
    if (legacyClassifier) {
      const downloads = library.downloads?.classifiers?.[legacyClassifier];
      if (downloads?.path) {
        nativeArchives.push({
          path: downloads.path,
          exclude: library.extract?.exclude ?? ["META-INF/"],
        });
        continue;
      }
    }
    if (isNativeByName) {
      const artifact = library.downloads?.artifact;
      if (artifact?.path) {
        nativeArchives.push({
          path: artifact.path,
          exclude: library.extract?.exclude ?? ["META-INF/"],
        });
      }
      continue;
    }
    const artifact = library.downloads?.artifact;
    const path = artifact?.path ?? nameToPath(library.name);
    if (!path) continue;
    const key = path.toLowerCase();
    if (seenArtifacts.has(key)) continue;
    seenArtifacts.add(key);
    classpath.push(path);
  }
  return { classpath, nativeArchives };
}

export function nameToPath(name: string): string | null {
  const parts = name.split(":");
  if (parts.length < 3) return null;
  const [group, artifact, version, classifier] = parts;
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ""}.jar`;
  return `${group.replace(/\./g, "/")}/${artifact}/${version}/${file}`;
}

export function libraryKey(name: string): string {
  const parts = name.split(":");
  return `${parts[0] ?? ""}:${parts[1] ?? ""}`;
}

export function mergeVersionJson(
  parent: VersionJson | null,
  child: VersionJson,
): MergedVersion {
  if (!parent) return { ...child };
  const libraryMap = new Map<string, Library>();
  for (const library of parent.libraries ?? []) {
    libraryMap.set(libraryKey(library.name), library);
  }
  for (const library of child.libraries ?? []) {
    libraryMap.set(libraryKey(library.name), library);
  }
  const gameArgs: (string | Record<string, unknown>)[] = [];
  const jvmArgs: (string | Record<string, unknown>)[] = [];
  for (const version of [parent, child]) {
    if (version.arguments?.game) {
      for (const entry of version.arguments.game) gameArgs.push(entry);
    }
    if (version.arguments?.jvm) {
      for (const entry of version.arguments.jvm) jvmArgs.push(entry);
    }
  }
  const merged: MergedVersion = {
    id: child.id ?? parent.id,
    type: child.type ?? parent.type,
    mainClass: child.mainClass ?? parent.mainClass,
    inheritsFrom: child.inheritsFrom,
    assets: child.assets ?? parent.assets,
    assetIndex: child.assetIndex ?? parent.assetIndex,
    downloads: {
      client: child.downloads?.client ?? parent.downloads?.client,
      server: child.downloads?.server ?? parent.downloads?.server,
    },
    libraries: [...libraryMap.values()],
    arguments: {
      game: gameArgs,
      jvm: jvmArgs,
    },
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments,
    logging: child.logging ?? parent.logging,
    javaVersion: child.javaVersion ?? parent.javaVersion,
    complianceLevel: child.complianceLevel ?? parent.complianceLevel,
    releaseTime: child.releaseTime ?? parent.releaseTime,
    time: child.time ?? parent.time,
    minimumLauncherVersion:
      child.minimumLauncherVersion ?? parent.minimumLauncherVersion,
  };
  if (gameArgs.length === 0) delete merged.arguments;
  return merged;
}

export function substitutePlaceholders(
  input: string,
  context: LaunchContext,
): string {
  const replacements: Record<string, string> = {
    auth_player_name: context.authPlayerName,
    version_name: context.versionName,
    game_directory: context.gameDir,
    assets_root: context.assetsRoot,
    assets_index_name: context.assetsIndexName,
    auth_uuid: compactUuid(context.authUuid),
    auth_access_token: context.authAccessToken,
    auth_xuid: context.authXuid,
    clientid: context.clientId,
    user_type: context.userType,
    version_type: context.versionType,
    natives_directory: context.nativesDir,
    launcher_name: context.launcherName,
    launcher_version: context.launcherVersion,
    classpath: context.classpath,
    classpath_separator: context.classpathSeparator,
    library_directory: context.libraryRoot,
    game_assets: context.assetsRoot,
    user_properties: "{}",
    resolution_width: String(context.resolutionWidth ?? 0),
    resolution_height: String(context.resolutionHeight ?? 0),
    quickPlayPath: "",
    quickPlaySingleplayer: "",
    quickPlayMultiplayer: "",
    quickPlayRealms: "",
  };
  return input.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (whole, name: string) => {
    return Object.prototype.hasOwnProperty.call(replacements, name)
      ? replacements[name]
      : whole;
  });
}

export function compactUuid(uuid: string): string {
  return uuid.replace(/-/g, "");
}

function normalizeArgumentEntry(
  entry: string | Record<string, unknown>,
  context: LaunchContext,
  platform: string,
  arch: string,
  osVersion: string,
): string[] {
  if (typeof entry === "string") {
    return [substitutePlaceholders(entry, context)];
  }
  const rules = entry.rules as Rule[] | undefined;
  const features = {
    ...DEFAULT_FEATURES,
    ...(context.features ?? {}),
    has_custom_resolution:
      (context.features?.has_custom_resolution ?? false) ||
      Boolean(context.resolutionWidth && context.resolutionHeight),
  };
  if (!evaluateRules(rules, platform, arch, osVersion, features)) return [];
  const value = entry.value;
  if (typeof value === "string") {
    return [substitutePlaceholders(value, context)];
  }
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => substitutePlaceholders(item, context));
  }
  return [];
}

export function buildGameArguments(
  version: MergedVersion,
  context: LaunchContext,
  platform: string = mapOsName(process.platform),
  arch: string = mapOsArch(process.arch),
  osVersion: string = String(os.release()),
): string[] {
  const entries = version.arguments?.game;
  if (entries && entries.length > 0) {
    return entries.flatMap((entry) =>
      normalizeArgumentEntry(entry, context, platform, arch, osVersion),
    );
  }
  if (version.minecraftArguments) {
    return splitLegacyArguments(version.minecraftArguments).map((arg) =>
      substitutePlaceholders(arg, context),
    );
  }
  return [];
}

export function buildJvmArguments(
  version: MergedVersion,
  context: LaunchContext,
  platform: string = mapOsName(process.platform),
  arch: string = mapOsArch(process.arch),
  osVersion: string = String(os.release()),
): string[] {
  const entries = version.arguments?.jvm;
  if (!entries || entries.length === 0) {
    return [
      `-Djava.library.path=${context.nativesDir}`,
      "-cp",
      context.classpath,
    ];
  }
  return entries
    .flatMap((entry) =>
      normalizeArgumentEntry(entry, context, platform, arch, osVersion),
    )
    .filter((arg) => arg !== "");
}

export function splitLegacyArguments(input: string): string[] {
  return input.split(/\s+/).filter(Boolean);
}

export function collectLoggingArgument(
  version: MergedVersion,
  logConfigPath: string,
): string[] {
  const logging = version.logging?.client;
  if (!logging) return [];
  return [substituteLogArgument(logging.argument, logConfigPath)];
}

export function substituteLogArgument(
  argument: string,
  logConfigPath: string,
): string {
  return argument.replace(/\$\{path\}/g, logConfigPath);
}

export function normalizeVersionForComparison(id: string): string {
  return id.replace(/[^0-9.]/g, "");
}

export function isVersionAtLeast(candidate: string, minimum: string): boolean {
  const a = normalizeVersionForComparison(candidate)
    .split(".")
    .map((part) => Number(part) || 0);
  const b = normalizeVersionForComparison(minimum)
    .split(".")
    .map((part) => Number(part) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}
