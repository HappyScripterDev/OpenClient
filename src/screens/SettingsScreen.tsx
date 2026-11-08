import { useCallback, useEffect, useState } from "react";
import {
  Coffee,
  Cpu,
  DownloadCloud,
  FolderCog,
  FolderOpen,
  Info,
  PackageSearch,
  Palette,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { JvmPresetId, ThemeMode } from "../shared/types";
import { JVM_PRESETS, recommendMemoryMb } from "../shared/jvm";
import { appStore, useAppState } from "../lib/store";
import {
  classNames,
  errorMessage,
  formatBytes,
  formatDate,
  unwrap,
} from "../lib/format";
import { Button, IconButton } from "../ui/Button";
import { Input } from "../ui/Field";
import { Select } from "../ui/Select";
import { Range, Switch } from "../ui/Controls";
import { Segmented } from "../ui/Tabs";
import { Badge } from "../ui/Panel";
import { PageHeader } from "../ui/Feedback";

type Section =
  | "appearance"
  | "java"
  | "memory"
  | "paths"
  | "behavior"
  | "catalog"
  | "updates"
  | "about";

const SECTIONS: { id: Section; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "java", label: "Java runtime", icon: Coffee },
  { id: "memory", label: "Memory & JVM", icon: Cpu },
  { id: "paths", label: "Paths", icon: FolderCog },
  { id: "behavior", label: "Behavior", icon: Settings2 },
  { id: "catalog", label: "Catalog", icon: PackageSearch },
  { id: "updates", label: "Updates", icon: DownloadCloud },
  { id: "about", label: "About", icon: Info },
];

const ACCENTS = [
  { value: "#8b6cff", label: "Liner violet" },
  { value: "#ff4d4d", label: "Red" },
  { value: "#7c6cff", label: "Indigo" },
  { value: "#a78bfa", label: "Violet" },
  { value: "#4fd1c5", label: "Mint" },
  { value: "#60a5fa", label: "Blue" },
  { value: "#f2b96b", label: "Amber" },
  { value: "#ff6b8a", label: "Rose" },
];

export function SettingsScreen() {
  const { settings, info, updateState } = useAppState();
  const [section, setSection] = useState<Section>("appearance");
  const [memory, setMemory] = useState(settings.memoryMb);
  const [systemMemory, setSystemMemory] = useState<number | null>(null);
  const [javaPath, setJavaPath] = useState(settings.javaPath);
  const [bedrockDir, setBedrockDir] = useState(settings.bedrockGameDir);
  const [curseforgeKey, setCurseforgeKey] = useState(settings.curseforgeApiKey);
  const [feedUrl, setFeedUrl] = useState(settings.updateFeedUrl);
  const [runtimes, setRuntimes] = useState<{
    managed: { major: number; path: string; version: string; installedAt: number; sizeBytes: number }[];
    system: { path: string; version: string; major: number; source: string; vendor: string }[];
  } | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState<number | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => setMemory(settings.memoryMb), [settings.memoryMb]);
  useEffect(() => setJavaPath(settings.javaPath), [settings.javaPath]);
  useEffect(() => setBedrockDir(settings.bedrockGameDir), [settings.bedrockGameDir]);
  useEffect(() => setCurseforgeKey(settings.curseforgeApiKey), [settings.curseforgeApiKey]);
  useEffect(() => setFeedUrl(settings.updateFeedUrl), [settings.updateFeedUrl]);

  useEffect(() => {
    void window.openclient.app
      .systemMemory()
      .then((result) => {
        if (result.ok) setSystemMemory(result.data.totalMb);
      })
      .catch(() => undefined);
  }, []);

  const loadRuntimes = useCallback(async () => {
    try {
      const result = await unwrap(window.openclient.java.runtimes());
      setRuntimes(result);
    } catch (error) {
      appStore.toast("Java scan failed", "error", errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadRuntimes();
  }, [loadRuntimes]);

  const downloadRuntime = async (major: number): Promise<void> => {
    setRuntimeBusy(major);
    try {
      const runtime = await unwrap(window.openclient.java.downloadRuntime(major));
      await loadRuntimes();
      appStore.toast("Java installed", "success", `Temurin ${runtime.version}`);
    } catch (error) {
      appStore.toast("Java download failed", "error", errorMessage(error));
    } finally {
      setRuntimeBusy(null);
    }
  };

  const saveMemory = async (): Promise<void> => {
    await appStore.updateSettings({ memoryMb: memory });
    appStore.toast("Default memory saved", "success", `${memory} MB for new profiles`);
  };

  const checkUpdates = async (): Promise<void> => {
    setUpdateBusy(true);
    try {
      const state = await unwrap(window.openclient.updater.check());
      appStore.toast(
        state.status === "available" ? "Update available" : "Update check finished",
        state.status === "error" ? "error" : "info",
        state.message,
      );
    } catch (error) {
      appStore.toast("Update check failed", "error", errorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  };

  const recommended = systemMemory ? recommendMemoryMb(systemMemory) : 4096;

  return (
    <div className="screen">
      <PageHeader
        eyebrow="OpenClient"
        title="Settings"
        subtitle="Appearance, runtimes, paths, catalog sources, updates and privacy."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={classNames("settings-nav-btn", section === item.id && "is-active")}
                onClick={() => setSection(item.id)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="settings-pane">
          {section === "appearance" ? (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Theme</h2>
                  <p className="settings-section-desc">
                    OpenClient ships with a dark, glass-first interface. Midnight deepens the
                    canvas and cools the borders.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Color mode</div>
                    <div className="setting-hint">The accent and glass tints follow automatically.</div>
                  </div>
                  <div className="setting-control">
                    <Segmented<ThemeMode>
                      value={settings.theme}
                      onChange={(value) => void appStore.updateSettings({ theme: value })}
                      ariaLabel="Theme"
                      options={[
                        { value: "dark", label: "Dark" },
                        { value: "midnight", label: "Midnight" },
                      ]}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Accent</div>
                    <div className="setting-hint">
                      Used for primary actions, active navigation and focus rings.
                    </div>
                  </div>
                  <div className="setting-control">
                    <div className="chip-row">
                      {ACCENTS.map((accent) => (
                        <button
                          key={accent.value}
                          type="button"
                          className="swatch"
                          aria-label={`Use ${accent.label} accent`}
                          title={accent.label}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 9,
                            border: settings.accent === accent.value ? "2px solid var(--text)" : "1px solid var(--border)",
                            background: accent.value,
                            cursor: "pointer",
                            padding: 0,
                          }}
                          onClick={() => void appStore.updateSettings({ accent: accent.value })}
                        />
                      ))}
                      <label
                        className="chip"
                        style={{ cursor: "pointer", height: 28 }}
                        title="Custom accent color"
                      >
                        Custom
                        <input
                          type="color"
                          value={settings.accent}
                          onChange={(event) =>
                            void appStore.updateSettings({ accent: event.target.value })
                          }
                          style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
                          aria-label="Custom accent color"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Layout & motion</h2>
                </div>
                <SettingToggle
                  name="Reduce motion"
                  hint="Disables page, dialog and skeleton animations."
                  checked={settings.reduceMotion}
                  onChange={(value) => void appStore.updateSettings({ reduceMotion: value })}
                />
              </div>
            </>
          ) : null}

          {section === "java" ? (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Java executable</h2>
                  <p className="settings-section-desc">
                    Leave empty for automatic selection. OpenClient prefers a managed runtime that
                    matches the Minecraft version, then falls back to an installed Java.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Custom Java path</div>
                    <div className="setting-hint">Used only when the managed runtime is unavailable.</div>
                  </div>
                  <div className="setting-control is-wide">
                    <Input
                      value={javaPath}
                      onChange={(event) => setJavaPath(event.target.value)}
                      placeholder="Automatic"
                      mono
                    />
                    <Button
                      variant="secondary"
                      icon={<FolderOpen size={14} />}
                      onClick={() => {
                        void window.openclient.app
                          .pickFile("Select java executable")
                          .then((result) => {
                            if (result.ok && result.data) setJavaPath(result.data);
                          });
                      }}
                    >
                      Browse
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() =>
                        void appStore
                          .updateSettings({ javaPath: javaPath.trim() })
                          .then(() => appStore.toast("Java path saved", "success"))
                      }
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Detected runtimes</h2>
                  <p className="settings-section-desc">
                    Managed runtimes are installed inside the OpenClient data folder and are
                    checksum verified.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Scan this computer</div>
                    <div className="setting-hint">PATH, JAVA_HOME, Eclipse Adoptium, Oracle, Zulu, Corretto and Microsoft.</div>
                  </div>
                  <div className="setting-control">
                    <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void loadRuntimes()}>
                      Rescan
                    </Button>
                  </div>
                </div>
                {runtimes === null ? (
                  <div className="setting-row">
                    <div className="skeleton skeleton-line" style={{ width: "100%" }} />
                  </div>
                ) : (
                  <>
                    {runtimes.managed.map((runtime) => (
                      <div className="setting-row" key={runtime.path}>
                        <div className="setting-info">
                          <div className="setting-name">
                            Temurin {runtime.major} · managed
                          </div>
                          <div className="setting-hint mono truncate">{runtime.path}</div>
                        </div>
                        <div className="setting-control">
                          <Badge variant="accent">{runtime.version}</Badge>
                          <span className="field-hint">{formatBytes(runtime.sizeBytes)}</span>
                        </div>
                      </div>
                    ))}
                    {runtimes.system.map((runtime) => (
                      <div className="setting-row" key={runtime.path}>
                        <div className="setting-info">
                          <div className="setting-name">
                            Java {runtime.major} · {runtime.vendor}
                          </div>
                          <div className="setting-hint mono truncate">{runtime.path}</div>
                        </div>
                        <div className="setting-control">
                          <Badge variant="muted">{runtime.version}</Badge>
                        </div>
                      </div>
                    ))}
                    {runtimes.managed.length === 0 && runtimes.system.length === 0 ? (
                      <div className="setting-row">
                        <div className="setting-info">
                          <div className="setting-name">No Java found</div>
                          <div className="setting-hint">Download a managed runtime below or install Java 21.</div>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Install a managed runtime</div>
                    <div className="setting-hint">Temurin JRE from Eclipse Adoptium, SHA-256 verified.</div>
                  </div>
                  <div className="setting-control">
                    {[8, 17, 21].map((major) => (
                      <Button
                        key={major}
                        variant="secondary"
                        size="sm"
                        loading={runtimeBusy === major}
                        onClick={() => void downloadRuntime(major)}
                      >
                        Java {major}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {section === "memory" ? (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Memory</h2>
                  <p className="settings-section-desc">
                    Defaults for newly created profiles. Existing profiles keep their own value.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Default allocation</div>
                    <div className="setting-hint">
                      Recommended: {recommended} MB
                      {systemMemory ? ` of ${(systemMemory / 1024).toFixed(0)} GB system memory` : ""}.
                    </div>
                  </div>
                  <div className="setting-control is-wide">
                    <Range
                      value={memory}
                      min={1024}
                      max={16384}
                      step={512}
                      onChange={setMemory}
                      label="Default memory in megabytes"
                    />
                    <span className="mono" style={{ width: 66, textAlign: "right", fontSize: 12 }}>
                      {memory} MB
                    </span>
                    <Button variant="primary" size="sm" onClick={() => void saveMemory()}>
                      Save
                    </Button>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">JVM preset</h2>
                  <p className="settings-section-desc">
                    G1 is the safe default. ZGC needs Java 21 and is useful on large heaps.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Default garbage collector</div>
                    <div className="setting-hint">
                      {JVM_PRESETS.find((preset) => preset.id === settings.jvmPreset)?.description}
                    </div>
                  </div>
                  <div className="setting-control is-wide">
                    <Select
                      value={settings.jvmPreset}
                      onChange={(value) =>
                        void appStore.updateSettings({ jvmPreset: value as JvmPresetId })
                      }
                      options={JVM_PRESETS.map((preset) => ({
                        value: preset.id,
                        label: preset.name,
                        description: preset.recommendedFor,
                      }))}
                      ariaLabel="Default JVM preset"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {section === "paths" ? (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Launcher data</h2>
                  <p className="settings-section-desc">
                    Shared versions, libraries, assets and managed runtimes live here. Existing
                    profiles keep their own game directories.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Data folder</div>
                    <div className="setting-hint mono">{settings.dataRoot}</div>
                  </div>
                  <div className="setting-control">
                    <Button
                      variant="secondary"
                      icon={<FolderOpen size={14} />}
                      onClick={() => void window.openclient.app.openPath(settings.dataRoot)}
                    >
                      Open
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void window.openclient.app
                          .pickDirectory("Select data folder", settings.dataRoot)
                          .then((result) => {
                            if (result.ok && result.data) {
                              void appStore.updateSettings({ dataRoot: result.data });
                            }
                          });
                      }}
                    >
                      Change
                    </Button>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Bedrock com.mojang folder</div>
                    <div className="setting-hint">
                      Override automatic detection. Point at the folder that contains resource_packs,
                      behavior_packs, minecraftWorlds and minecraftpe.
                    </div>
                  </div>
                  <div className="setting-control is-wide">
                    <Input
                      value={bedrockDir}
                      onChange={(event) => setBedrockDir(event.target.value)}
                      placeholder="Detected automatically"
                      mono
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void window.openclient.app
                          .pickDirectory("Select com.mojang folder", bedrockDir)
                          .then((result) => {
                            if (result.ok && result.data) setBedrockDir(result.data);
                          });
                      }}
                    >
                      Browse
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() =>
                        void appStore
                          .updateSettings({ bedrockGameDir: bedrockDir.trim() })
                          .then(() => appStore.toast("Bedrock folder saved", "success"))
                      }
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Download behavior</h2>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Parallel downloads</div>
                    <div className="setting-hint">Files downloaded at the same time. 8 is a good balance.</div>
                  </div>
                  <div className="setting-control is-wide">
                    <Range
                      value={settings.downloadConcurrency}
                      min={1}
                      max={24}
                      step={1}
                      onChange={(value) =>
                        void appStore.updateSettings({ downloadConcurrency: value })
                      }
                      label="Parallel download count"
                    />
                    <span className="mono" style={{ width: 36, textAlign: "right", fontSize: 12 }}>
                      {settings.downloadConcurrency}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {section === "behavior" ? (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Window</h2>
                </div>
                <SettingToggle
                  name="Close to tray"
                  hint="The close button hides OpenClient instead of quitting."
                  checked={settings.closeToTray}
                  onChange={(value) => void appStore.updateSettings({ closeToTray: value })}
                />
                <SettingToggle
                  name="Minimize to tray"
                  hint="Minimizing hides the window and keeps downloads running."
                  checked={settings.minimizeToTray}
                  onChange={(value) => void appStore.updateSettings({ minimizeToTray: value })}
                />
                <SettingToggle
                  name="Launch OpenClient on startup"
                  hint="Available in packaged builds. Uses your operating system login items."
                  checked={settings.launchOnStartup}
                  onChange={(value) => void appStore.updateSettings({ launchOnStartup: value })}
                />
              </div>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Game</h2>
                </div>
                <SettingToggle
                  name="Keep launcher open while playing"
                  hint="Leave OpenClient available for logs and downloads."
                  checked={settings.keepLauncherOpen}
                  onChange={(value) => void appStore.updateSettings({ keepLauncherOpen: value })}
                />
                <SettingToggle
                  name="Show snapshots"
                  hint="Include snapshots and old versions in the version picker."
                  checked={settings.showSnapshots}
                  onChange={(value) => void appStore.updateSettings({ showSnapshots: value })}
                />
                <SettingToggle
                  name="Confirm before quitting"
                  hint="Ask before quitting OpenClient when a game is running."
                  checked={settings.confirmOnExit}
                  onChange={(value) => void appStore.updateSettings({ confirmOnExit: value })}
                />
              </div>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Language</h2>
                  <p className="settings-section-desc">
                    The interface is currently English. The locale layer is ready for additional
                    translations; no partial language is offered.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Interface language</div>
                    <div className="setting-hint">English</div>
                  </div>
                  <div className="setting-control">
                    <Badge variant="muted">English</Badge>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {section === "catalog" ? (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Mod sources</h2>
                  <p className="settings-section-desc">
                    Modrinth is the primary source. CurseForge is optional and needs an API key
                    created at console.curseforge.com. No third-party mod is bundled with OpenClient.
                  </p>
                </div>
                <SettingToggle
                  name="Enable CurseForge as a second source"
                  hint="The catalog shows a source switch when an API key is present."
                  checked={settings.catalogSource === "both"}
                  onChange={(value) =>
                    void appStore.updateSettings({
                      catalogSource: value ? "both" : "modrinth",
                    })
                  }
                />
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">CurseForge API key</div>
                    <div className="setting-hint">
                      Stored locally in the OpenClient settings file. Never sent anywhere except the
                      CurseForge API.
                    </div>
                  </div>
                  <div className="setting-control is-wide">
                    <Input
                      type="password"
                      value={curseforgeKey}
                      onChange={(event) => setCurseforgeKey(event.target.value)}
                      placeholder="API key"
                      autoComplete="off"
                    />
                    <Button
                      variant="primary"
                      onClick={() =>
                        void appStore
                          .updateSettings({ curseforgeApiKey: curseforgeKey.trim() })
                          .then(() => appStore.toast("Catalog key saved", "success"))
                      }
                    >
                      Save
                    </Button>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Compatible versions only</div>
                    <div className="setting-hint">
                      Catalog results are filtered by the selected profile's game version and loader.
                      Hash checks are mandatory.
                    </div>
                  </div>
                  <div className="setting-control">
                    <Badge variant="success">On</Badge>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {section === "updates" ? (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">OpenClient updates</h2>
                  <p className="settings-section-desc">
                    electron-updater checks a generic feed when a URL is configured. Without a feed,
                    packaged builds report that updates are not configured instead of failing silently.
                  </p>
                </div>
                <SettingToggle
                  name="Check for updates automatically"
                  hint="Runs once after startup and never blocks the launcher."
                  checked={settings.autoCheckUpdates}
                  onChange={(value) => void appStore.updateSettings({ autoCheckUpdates: value })}
                />
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Update feed URL</div>
                    <div className="setting-hint">HTTPS base URL containing latest.yml / latest.json.</div>
                  </div>
                  <div className="setting-control is-wide">
                    <Input
                      value={feedUrl}
                      onChange={(event) => setFeedUrl(event.target.value)}
                      placeholder="https://updates.example.com/openclient"
                      mono
                    />
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void appStore
                          .updateSettings({ updateFeedUrl: feedUrl.trim() })
                          .then(() => appStore.toast("Feed saved", "success"))
                      }
                    >
                      Save
                    </Button>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Current state</div>
                    <div className="setting-hint">{updateState.message ?? "Not checked yet."}</div>
                  </div>
                  <div className="setting-control">
                    <Badge variant={updateState.status === "error" ? "danger" : updateState.status === "ready" ? "success" : "muted"}>
                      {updateState.status}
                    </Badge>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={updateBusy}
                      onClick={() => void checkUpdates()}
                    >
                      Check
                    </Button>
                    {updateState.status === "available" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void window.openclient.updater.download()}
                      >
                        Download
                      </Button>
                    ) : null}
                    {updateState.status === "ready" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void window.openclient.updater.install()}
                      >
                        Restart and install
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="notice is-info">
                <DownloadCloud size={16} />
                <div>
                  Updating OpenClient never touches your profiles, worlds or game installations.
                </div>
              </div>
            </>
          ) : null}

          {section === "about" ? (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">OpenClient {info?.version ?? ""}</h2>
                  <p className="settings-section-desc">
                    A performance and quality-of-life launcher for Minecraft Java and Bedrock.
                    Built with Electron, React, TypeScript and Vite.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Application data</div>
                    <div className="setting-hint mono truncate">{info?.dataRoot}</div>
                  </div>
                  <div className="setting-control">
                    <Button
                      variant="secondary"
                      icon={<FolderOpen size={14} />}
                      onClick={() => void window.openclient.app.openPath(info?.dataRoot ?? "")}
                    >
                      Open
                    </Button>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Runtime</div>
                    <div className="setting-hint">
                      Electron {info?.electron} · Chromium {info?.chrome} · Node {info?.node} ·{" "}
                      {info?.platform} {info?.arch}
                    </div>
                  </div>
                  <div className="setting-control">
                    <Badge variant={info?.isPackaged ? "success" : "warning"}>
                      {info?.isPackaged ? "Packaged" : "Development"}
                    </Badge>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Install directory</div>
                    <div className="setting-hint">{settings.dataRoot}</div>
                  </div>
                  <div className="setting-control">
                    <Button
                      variant="secondary"
                      icon={<Trash2 size={14} />}
                      onClick={() => void window.openclient.app.openPath(settings.dataRoot)}
                    >
                      Browse files
                    </Button>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Principles</h2>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">No cheats or unfair advantages</div>
                    <div className="setting-hint">
                      OpenClient includes performance and quality-of-life features only. No x-ray,
                      combat automation or movement exploits.
                    </div>
                  </div>
                  <ShieldCheck size={18} className="text-success" />
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">No telemetry by default</div>
                    <div className="setting-hint">
                      This build sends no analytics. Downloads and authentication go directly to
                      Mojang, Microsoft, Modrinth and CurseForge.
                    </div>
                  </div>
                  <ShieldCheck size={18} className="text-success" />
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Third-party content</div>
                    <div className="setting-hint">
                      Mods, packs and shaders are downloaded from their official APIs at runtime.
                      Authors and licenses are shown in the catalog.
                    </div>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Bedrock limitations</div>
                    <div className="setting-hint">
                      No official mod API, no client injection, and direct join is a deep link that
                      opens Bedrock. OpenClient is honest about what the platform allows.
                    </div>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Credits & links</h2>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Minecraft EULA</div>
                    <div className="setting-hint">Required before Java Edition can launch.</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void window.openclient.app.openExternal(
                        "https://www.minecraft.net/en-us/eula",
                      )
                    }
                  >
                    Open
                  </Button>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Modrinth</div>
                    <div className="setting-hint">Primary mod, pack and shader catalog.</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void window.openclient.app.openExternal("https://modrinth.com")}
                  >
                    Open
                  </Button>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Eclipse Adoptium</div>
                    <div className="setting-hint">Managed Temurin Java runtimes.</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void window.openclient.app.openExternal("https://adoptium.net")}
                  >
                    Open
                  </Button>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Last settings save</div>
                    <div className="setting-hint">{formatDate(Date.now())}</div>
                  </div>
                  <IconButton
                    label="Refresh settings"
                    size="sm"
                    onClick={() => void appStore.refreshSettings()}
                  >
                    <RefreshCw size={14} />
                  </IconButton>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SettingToggle({
  name,
  hint,
  checked,
  onChange,
}: {
  name: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-info">
        <div className="setting-name">{name}</div>
        <div className="setting-hint">{hint}</div>
      </div>
      <div className="setting-control">
        <Switch checked={checked} onChange={onChange} label={name} />
      </div>
    </div>
  );
}
