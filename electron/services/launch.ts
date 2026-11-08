import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import { EventEmitter } from "node:events";
import AdmZip from "adm-zip";
import {
  assetsDir,
  ensureDir,
  librariesDir,
  resolveDataRoot,
  versionsDir,
} from "./paths";
import { settingsService } from "./settings";
import { profilesService } from "./profiles";
import { versionService } from "./versions";
import { javaService, javaMajorForMinecraftVersion } from "./java";
import { loaderService } from "./loaders";
import { accountService } from "./accounts";
import { logger } from "./logger";
import { ServiceError } from "./errors";
import { removeFileIfExists } from "./files";
import {
  buildGameArguments,
  buildJvmArguments,
  collectLoggingArgument,
  mapOsArch,
  mapOsName,
  planLibraries,
  type LaunchContext,
  type MergedVersion,
} from "../core/mojang";
import {
  buildJvmArguments as buildPresetArguments,
} from "../../src/shared/jvm";
import type {
  GameProcessState,
  JavaProfile,
  LaunchResult,
} from "../../src/shared/types";
import os from "node:os";

interface PreparedLaunch {
  profile: JavaProfile;
  launchVersionId: string;
  chain: VersionChainResult;
  runtimePath: string;
  runtimeMajor: number;
}

interface VersionChainResult {
  merged: MergedVersion;
  jarVersionId: string;
  versionDir: string;
}

class LaunchService extends EventEmitter {
  private child: ChildProcess | null = null;
  private state: GameProcessState = { running: false };

  getState(): GameProcessState {
    return { ...this.state };
  }

  async prepare(profileId: string): Promise<PreparedLaunch> {
    const settings = await settingsService.load();
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const launchVersionId =
      profile.loader === "vanilla"
        ? profile.gameVersion
        : await loaderService.resolveLaunchVersion(profile);
    logger.info("launch", `Preparing ${profile.name} (${launchVersionId})`);
    let chain: VersionChainResult;
    try {
      chain = await versionService.ensureVersionInstalled(launchVersionId);
    } catch (error) {
      throw new ServiceError(
        "DOWNLOAD_FAILED",
        error instanceof Error ? error.message : "Game files could not be installed",
      );
    }
    const requiredMajor =
      chain.merged.javaVersion?.majorVersion ??
      javaMajorForMinecraftVersion(profile.gameVersion);
    let runtime;
    try {
      runtime = await javaService.ensureRuntime(requiredMajor, profile.javaPath);
    } catch (error) {
      throw new ServiceError(
        "JAVA_MISSING",
        error instanceof Error ? error.message : "Java runtime is not available",
      );
    }
    const dataRoot = resolveDataRoot(settings);
    ensureDir(profile.gameDir);
    for (const folder of ["mods", "resourcepacks", "shaderpacks", "saves", "logs", "crash-reports"]) {
      ensureDir(path.join(profile.gameDir, folder));
    }
    ensureDir(librariesDir(dataRoot));
    ensureDir(assetsDir(dataRoot));
    ensureDir(versionsDir(dataRoot));
    return {
      profile,
      launchVersionId,
      chain,
      runtimePath: runtime.path,
      runtimeMajor: runtime.major,
    };
  }

  async launch(
    profileId: string,
    options: { server?: string; port?: number } = {},
  ): Promise<LaunchResult> {
    if (this.state.running) {
      throw new ServiceError("INVALID_INPUT", "A game instance is already running");
    }
    const prepared = await this.prepare(profileId);
    const { profile, chain, runtimePath } = prepared;
    const settings = await settingsService.load();
    if (!settings.eulaAccepted) {
      throw new ServiceError(
        "EULA_REQUIRED",
        "Accept the Minecraft End User License Agreement to launch.",
      );
    }
    const dataRoot = resolveDataRoot(settings);
    let session;
    try {
      session = await accountService.getLaunchSession();
    } catch (error) {
      throw new ServiceError(
        "AUTH_REQUIRED",
        error instanceof Error ? error.message : "Sign in before launching",
      );
    }

    const nativesDir = path.join(profile.gameDir, "natives");
    this.prepareNatives(chain, nativesDir);

    const librariesRoot = librariesDir(dataRoot);
    const assetsRoot = assetsDir(dataRoot);
    const platform = mapOsName(process.platform);
    const arch = mapOsArch(process.arch);
    const plan = planLibraries(
      chain.merged.libraries ?? [],
      platform,
      arch,
      os.release(),
    );
    const clientJar = versionService.clientJarPath(chain, dataRoot);
    if (!fs.existsSync(clientJar)) {
      throw new ServiceError(
        "CORRUPT",
        "The Minecraft client jar is missing. Use Repair profile and try again.",
      );
    }
    const classpath = [
      ...plan.classpath.map((relative) =>
        path.join(librariesRoot, relative.split("/").join(path.sep)),
      ),
      clientJar,
    ].join(path.delimiter);

    const loggingFile = chain.merged.logging?.client?.file;
    const loggingPath = loggingFile
      ? path.join(assetsRoot, "log_configs", loggingFile.id)
      : "";

    const context: LaunchContext = {
      gameDir: profile.gameDir,
      assetsRoot,
      assetsIndexName:
        chain.merged.assetIndex?.id ?? chain.merged.assets ?? "legacy",
      nativesDir,
      libraryRoot: librariesRoot,
      classpath,
      classpathSeparator: path.delimiter,
      authPlayerName: session.username,
      authUuid: session.uuid,
      authAccessToken: session.accessToken,
      authXuid: session.xuid,
      clientId: session.clientId,
      userType: "msa",
      versionName: chain.merged.id,
      versionType: chain.merged.type ?? "release",
      launcherName: "OpenClient",
      launcherVersion: "1.0.0",
      javaMajor: prepared.runtimeMajor,
    };

    const versionJvmArgs = buildJvmArguments(
      chain.merged,
      context,
      platform,
      arch,
      os.release(),
    );
    const versionGameArgs = buildGameArguments(
      chain.merged,
      context,
      platform,
      arch,
      os.release(),
    );
    const loggingArgs =
      loggingFile && fs.existsSync(loggingPath)
        ? collectLoggingArgument(chain.merged, loggingPath)
        : [];
    const presetArgs = buildPresetArguments(
      profile.jvmPreset,
      prepared.runtimeMajor,
      profile.memoryMb,
      profile.customJvmArgs,
    );
    const effectivePresetArgs =
      profile.jvmPreset === "custom" ? profile.customJvmArgs : presetArgs;
    const memoryArgs =
      profile.jvmPreset === "custom"
        ? [`-Xms${profile.memoryMb}M`, `-Xmx${profile.memoryMb}M`]
        : [];
    const extraJvm = [
      "-Dfile.encoding=UTF-8",
      "-Djava.awt.headless=false",
      "-Dminecraft.launcher.brand=OpenClient",
      "-Dminecraft.launcher.version=1.0.0",
    ];
    const jvmArgs = [
      ...versionJvmArgs,
      ...memoryArgs,
      ...effectivePresetArgs,
      ...loggingArgs,
      ...extraJvm,
    ];
    const gameArgs = [...versionGameArgs];
    if (options.server) {
      gameArgs.push("--server", options.server);
      if (options.port) gameArgs.push("--port", String(options.port));
    }

    const command = [runtimePath, ...jvmArgs, chain.merged.mainClass, ...gameArgs];
    const redacted = command.map((arg) =>
      arg === session.accessToken ? "[access token]" : arg,
    );
    fs.writeFileSync(
      path.join(profile.gameDir, "eula.txt"),
      "eula=true\n",
    );
    ensureDir(path.join(profile.gameDir, "logs"));
    logger.info(
      "launch",
      `Starting ${profile.name} with Java ${prepared.runtimeMajor} (${profile.memoryMb} MB)`,
    );
    logger.debug("launch", `Command: ${redacted.join(" ")}`);

    const child = spawn(runtimePath, [...jvmArgs, chain.merged.mainClass, ...gameArgs], {
      cwd: profile.gameDir,
      env: {
        ...process.env,
        JAVA_TOOL_OPTIONS: "",
        _JAVA_OPTIONS: "",
      },
      windowsHide: false,
      detached: false,
    });
    this.child = child;
    const startedAt = Date.now();
    this.state = {
      running: true,
      pid: child.pid,
      profileId: profile.id,
      startedAt,
    };
    this.emit("state", this.getState());
    this.pipeOutput(child, profile, session.accessToken);
    child.on("error", (error) => {
      logger.error("launch", `Game process error: ${error.message}`);
      this.state = {
        ...this.state,
        running: false,
        exitCode: -1,
      };
      this.emit("state", this.getState());
    });
    child.on("close", (code) => {
      this.child = null;
      this.state = {
        running: false,
        pid: undefined,
        profileId: profile.id,
        startedAt,
        exitCode: code ?? -1,
      };
      logger.info(
        "launch",
        `Minecraft exited with code ${code ?? "unknown"} after ${Math.round((Date.now() - startedAt) / 1000)}s`,
      );
      this.emit("state", this.getState());
    });
    await profilesService.update(profile.id, { lastPlayed: Date.now() });
    return {
      pid: child.pid ?? 0,
      command: redacted.join(" "),
      startedAt,
    };
  }

  private pipeOutput(
    child: ChildProcess,
    profile: JavaProfile,
    accessToken: string,
  ): void {
    const source = `game:${profile.name}`;
    const attach = (stream: NodeJS.ReadableStream | null): void => {
      if (!stream) return;
      const reader = readline.createInterface({ input: stream });
      reader.on("line", (line) => {
        const clean = (accessToken
          ? line.split(accessToken).join("[token]")
          : line
        ).replace(sessionTokenPattern, "[token]");
        if (clean.trim().length === 0) return;
        logger.game(source, clean.slice(0, 8000));
      });
    };
    attach(child.stdout);
    attach(child.stderr);
  }

  private prepareNatives(chain: VersionChainResult, nativesDir: string): void {
    fs.rmSync(nativesDir, { recursive: true, force: true });
    ensureDir(nativesDir);
    const settings = settingsService.get();
    const dataRoot = resolveDataRoot(settings);
    const plan = planLibraries(
      chain.merged.libraries ?? [],
      mapOsName(process.platform),
      mapOsArch(process.arch),
      os.release(),
    );
    for (const archive of plan.nativeArchives) {
      const jarPath = path.join(
        librariesDir(dataRoot),
        archive.path.split("/").join(path.sep),
      );
      if (!fs.existsSync(jarPath)) continue;
      try {
        const zip = new AdmZip(jarPath);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          if (archive.exclude.some((prefix) => entry.entryName.startsWith(prefix))) {
            continue;
          }
          const target = path.resolve(nativesDir, entry.entryName);
          if (!target.startsWith(path.resolve(nativesDir))) continue;
          ensureDir(path.dirname(target));
          fs.writeFileSync(target, entry.getData());
          if (process.platform !== "win32") {
            try {
              fs.chmodSync(target, 0o755);
            } catch {
              void 0;
            }
          }
        }
      } catch (error) {
        logger.warn(
          "launch",
          `Could not extract native archive ${path.basename(jarPath)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.child || !this.child.pid) return;
    const pid = this.child.pid;
    logger.info("launch", "Stopping Minecraft");
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
    } else {
      try {
        this.child.kill("SIGTERM");
      } catch {
        void 0;
      }
    }
  }

  async repair(profileId: string): Promise<void> {
    const prepared = await this.prepare(profileId);
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    const jar = versionService.clientJarPath(prepared.chain, dataRoot);
    await removeFileIfExists(jar);
    await removeFileIfExists(`${jar}.part`);
    fs.rmSync(path.join(prepared.profile.gameDir, "natives"), {
      recursive: true,
      force: true,
    });
    const indexFile = path.join(
      assetsDir(dataRoot),
      "indexes",
      `${prepared.chain.merged.assetIndex?.id ?? "legacy"}.json`,
    );
    await removeFileIfExists(indexFile);
    await versionService.ensureVersionInstalled(prepared.launchVersionId);
    logger.info("launch", `Repaired profile ${prepared.profile.name}`);
  }
}

const sessionTokenPattern = /accessToken=[^&\s]+/g;

export const launchService = new LaunchService();
