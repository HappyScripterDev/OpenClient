import { useSyncExternalStore } from "react";
import type {
  AccountSummary,
  AppInfo,
  AppSettings,
  DownloadProgress,
  GameProcessState,
  LogEntry,
  Profile,
  UpdateState,
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/defaults";
import type {
  AuthFlowStatus,
  WindowState,
} from "../shared/ipc";
import { errorMessage, unwrap } from "./format";
import { logBuffer } from "./logStore";
import { transferStore } from "./transferStore";

export type RouteId =
  | "home"
  | "profiles"
  | "mods"
  | "hud"
  | "packs"
  | "servers"
  | "accounts"
  | "logs"
  | "settings"
  | "bedrock-content"
  | "bedrock-worlds";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  leaving?: boolean;
}

export interface LaunchOverlayState {
  active: boolean;
  title: string;
  description: string;
  progress: number | null;
}

interface PendingLaunch {
  profileId: string;
  server?: string;
  port?: number;
}

export interface AppState {
  ready: boolean;
  initError: string | null;
  info: AppInfo | null;
  settings: AppSettings;
  profiles: Profile[];
  accounts: AccountSummary[];
  edition: "java" | "bedrock";
  selectedProfileId: string;
  route: RouteId;
  toasts: ToastMessage[];
  gameState: GameProcessState;
  updateState: UpdateState;
  authStatus: AuthFlowStatus | null;
  launchOverlay: LaunchOverlayState | null;
  eulaOpen: boolean;
  bedrockNoticeSeen: boolean;
  windowState: WindowState;
}

const initialSettings: AppSettings = { ...DEFAULT_SETTINGS };

function initialBedrockNoticeSeen(): boolean {
  try {
    return localStorage.getItem("openclient.bedrockNoticeSeen") === "1";
  } catch {
    return false;
  }
}

const initialState: AppState = {
  ready: false,
  initError: null,
  info: null,
  settings: initialSettings,
  profiles: [],
  accounts: [],
  edition: "java",
  selectedProfileId: "",
  route: "home",
  toasts: [],
  gameState: { running: false },
  updateState: { status: "idle" },
  authStatus: null,
  launchOverlay: null,
  eulaOpen: false,
  bedrockNoticeSeen: initialBedrockNoticeSeen(),
  windowState: { maximized: false, focused: true, fullscreen: false },
};

export class AppStore {
  private state: AppState = initialState;
  private listeners = new Set<() => void>();
  private initPromise: Promise<void> | null = null;
  private subscribed = false;
  private toastId = 0;
  private toastTimers = new Map<number, number>();
  private pendingLaunch: PendingLaunch | null = null;
  private previousRunning = false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AppState => this.state;

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  selectedProfile(): Profile | undefined {
    return this.state.profiles.find((profile) => profile.id === this.state.selectedProfileId);
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.bootstrap();
    return this.initPromise;
  }

  private async bootstrap(): Promise<void> {
    try {
      const api = window.openclient;
      const [info, settings, profiles, accounts, updateState, gameState, logs, windowState] =
        await Promise.all([
          unwrap(api.app.info()),
          unwrap(api.settings.get()),
          unwrap(api.profiles.list()),
          unwrap(api.auth.list()),
          unwrap(api.updater.state()),
          unwrap(api.java.processState()),
          unwrap(api.logs.list()),
          unwrap(api.app.window.getState()),
        ]);
      logBuffer.replace(logs);
      const edition = settings.defaultEdition;
      this.previousRunning = gameState.running;
      this.set({
        ready: true,
        info,
        settings,
        profiles,
        accounts,
        edition,
        selectedProfileId: this.resolveSelectedId(edition, settings, profiles),
        updateState,
        gameState,
        windowState,
      });
      this.subscribeEvents();
    } catch (error) {
      this.set({ ready: true, initError: errorMessage(error) });
    }
  }

  private resolveSelectedId(
    edition: "java" | "bedrock",
    settings: AppSettings,
    profiles: Profile[],
  ): string {
    const preferred =
      edition === "java"
        ? settings.selectedJavaProfileId
        : settings.selectedBedrockProfileId;
    if (profiles.some((profile) => profile.id === preferred)) return preferred;
    return profiles.find((profile) => profile.edition === edition)?.id ?? "";
  }

  private subscribeEvents(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    const api = window.openclient;
    api.events.onProgress((progress) => transferStore.set(progress));
    api.events.onLog((entry: LogEntry) => logBuffer.push(entry));
    api.events.onGameState((state) => {
      const wasRunning = this.previousRunning;
      this.previousRunning = state.running;
      this.set({ gameState: state });
      if (wasRunning && !state.running) {
        if (state.exitCode === 0) {
          this.toast("Minecraft closed", "info", "The game exited normally.");
        } else {
          this.toast(
            "Minecraft closed unexpectedly",
            "error",
            `Exit code ${state.exitCode ?? "unknown"}. Open Logs to inspect the crash report.`,
          );
        }
      }
    });
    api.events.onAuthStatus((status) => {
      this.set({ authStatus: status });
      if (status.state === "success") {
        this.toast("Signed in", "success", status.message);
        void this.refreshAccounts();
      } else if (status.state === "error") {
        this.toast("Sign-in failed", "error", status.message);
      }
    });
    api.events.onAuthChanged((accounts) => this.set({ accounts }));
    api.events.onProfilesChanged((profiles) => {
      const selected = profiles.find((profile) => profile.id === this.state.selectedProfileId);
      const fallback = profiles.find((profile) => profile.edition === this.state.edition);
      this.set({
        profiles,
        selectedProfileId: selected?.id ?? fallback?.id ?? "",
      });
    });
    api.events.onUpdateState((state) => this.set({ updateState: state }));
    api.app.window.onState((state) =>
      this.set({
        windowState: state,
        settings: state.maximized
          ? this.state.settings
          : this.state.settings,
      }),
    );
  }

  async refreshSettings(): Promise<AppSettings> {
    const settings = await unwrap(window.openclient.settings.get());
    this.set({
      settings,
      edition: settings.defaultEdition,
      selectedProfileId: this.resolveSelectedId(
        settings.defaultEdition,
        settings,
        this.state.profiles,
      ),
    });
    return settings;
  }

  async refreshProfiles(): Promise<Profile[]> {
    const profiles = await unwrap(window.openclient.profiles.list());
    const selected = this.resolveSelectedId(this.state.edition, this.state.settings, profiles);
    this.set({ profiles, selectedProfileId: selected });
    return profiles;
  }

  async refreshAccounts(): Promise<AccountSummary[]> {
    const accounts = await unwrap(window.openclient.auth.list());
    this.set({ accounts });
    return accounts;
  }

  async setEdition(edition: "java" | "bedrock"): Promise<void> {
    if (edition === this.state.edition) return;
    try {
      const settings = await unwrap(
        window.openclient.settings.update({ defaultEdition: edition }),
      );
      const selectedProfileId = this.resolveSelectedId(
        edition,
        settings,
        this.state.profiles,
      );
      const route = this.routeForEdition(this.state.route, edition);
      this.set({
        settings,
        edition,
        selectedProfileId,
        route,
      });
    } catch (error) {
      this.toast("Could not switch edition", "error", errorMessage(error));
    }
  }

  private routeForEdition(route: RouteId, edition: "java" | "bedrock"): RouteId {
    if (edition === "java" && (route === "bedrock-content" || route === "bedrock-worlds")) {
      return "home";
    }
    if (edition === "bedrock" && (route === "mods" || route === "packs")) {
      return "home";
    }
    return route;
  }

  async selectProfile(id: string): Promise<void> {
    const profile = this.state.profiles.find((entry) => entry.id === id);
    if (!profile) return;
    this.set({ selectedProfileId: id });
    try {
      const patch =
        profile.edition === "java"
          ? { selectedJavaProfileId: id }
          : { selectedBedrockProfileId: id };
      const settings = await unwrap(window.openclient.settings.update(patch));
      this.set({ settings });
    } catch {
      void 0;
    }
  }

  navigate(route: RouteId): void {
    this.set({ route: this.routeForEdition(route, this.state.edition) });
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings | null> {
    try {
      const settings = await unwrap(window.openclient.settings.update(patch));
      const selectedProfileId = this.resolveSelectedId(
        settings.defaultEdition,
        settings,
        this.state.profiles,
      );
      this.set({
        settings,
        edition: settings.defaultEdition,
        selectedProfileId,
      });
      return settings;
    } catch (error) {
      this.toast("Setting could not be saved", "error", errorMessage(error));
      return null;
    }
  }

  toast(
    title: string,
    variant: ToastVariant = "info",
    description?: string,
  ): number {
    const id = ++this.toastId;
    const toast: ToastMessage = { id, title, variant, description };
    this.set({ toasts: [...this.state.toasts, toast] });
    const lifetime = variant === "error" ? 9000 : variant === "warning" ? 7000 : 5000;
    const timer = window.setTimeout(() => this.dismissToast(id), lifetime);
    this.toastTimers.set(id, timer);
    return id;
  }

  dismissToast(id: number): void {
    const timer = this.toastTimers.get(id);
    if (timer) {
      window.clearTimeout(timer);
      this.toastTimers.delete(id);
    }
    this.set({
      toasts: this.state.toasts.map((toast) =>
        toast.id === id ? { ...toast, leaving: true } : toast,
      ),
    });
    window.setTimeout(() => {
      this.set({
        toasts: this.state.toasts.filter((toast) => toast.id !== id),
      });
    }, 190);
  }

  markBedrockNoticeSeen(): void {
    try {
      localStorage.setItem("openclient.bedrockNoticeSeen", "1");
    } catch {
      void 0;
    }
    this.set({ bedrockNoticeSeen: true });
  }

  setLaunchOverlay(overlay: LaunchOverlayState | null): void {
    this.set({ launchOverlay: overlay });
  }

  async launchProfile(
    profileId?: string,
    options: { server?: string; port?: number } = {},
  ): Promise<void> {
    const profile =
      this.state.profiles.find((entry) => entry.id === (profileId || this.state.selectedProfileId)) ??
      this.selectedProfile();
    if (!profile) {
      this.toast("No profile selected", "warning", "Create a profile first.");
      return;
    }
    if (profile.edition === "bedrock") {
      try {
        await unwrap(window.openclient.bedrock.launch());
        this.toast("Bedrock started", "success", "Minecraft Bedrock is opening.");
      } catch (error) {
        this.toast("Bedrock could not start", "error", errorMessage(error));
      }
      return;
    }
    if (!this.state.accounts.some((account) => account.active)) {
      this.toast(
        "Sign in required",
        "warning",
        "Minecraft Java Edition needs a Microsoft account.",
      );
      this.navigate("accounts");
      return;
    }
    if (!this.state.settings.eulaAccepted) {
      this.pendingLaunch = { profileId: profile.id, ...options };
      this.set({ eulaOpen: true });
      return;
    }
    await this.performJavaLaunch(profile, options);
  }

  async acceptEula(): Promise<void> {
    const settings = await this.updateSettings({ eulaAccepted: true });
    this.set({ eulaOpen: false });
    if (!settings) return;
    const pending = this.pendingLaunch;
    this.pendingLaunch = null;
    if (!pending) return;
    const profile = this.state.profiles.find((entry) => entry.id === pending.profileId);
    if (profile) await this.performJavaLaunch(profile, pending);
  }

  declineEula(): void {
    this.pendingLaunch = null;
    this.set({ eulaOpen: false });
  }

  async performJavaLaunch(
    profile: Profile,
    options: { server?: string; port?: number } = {},
  ): Promise<void> {
    if (profile.edition !== "java") return;
    this.setLaunchOverlay({
      active: true,
      title: `Preparing ${profile.name}`,
      description: "Verifying game files, libraries, assets and the Java runtime.",
      progress: null,
    });
    try {
      await unwrap(window.openclient.java.prepare(profile.id));
      this.setLaunchOverlay({
        active: true,
        title: "Starting Minecraft",
        description: `${profile.gameVersion} · ${profile.loader === "vanilla" ? "Vanilla" : profile.loader}`,
        progress: null,
      });
      await unwrap(
        window.openclient.java.launch(profile.id, {
          server: options.server,
          port: options.port,
        }),
      );
      this.toast("Minecraft is starting", "success", profile.name);
      window.setTimeout(() => this.setLaunchOverlay(null), 1400);
    } catch (error) {
      this.setLaunchOverlay(null);
      const message = errorMessage(error);
      this.toast("Launch failed", "error", message);
    }
  }

  async stopGame(): Promise<void> {
    try {
      await unwrap(window.openclient.java.stop());
      this.toast("Stopping Minecraft", "info");
    } catch (error) {
      this.toast("Could not stop the game", "error", errorMessage(error));
    }
  }

  dismissLaunchOverlay(): void {
    this.set({ launchOverlay: null });
  }

  handleProgress(progress: DownloadProgress): void {
    transferStore.set(progress);
  }
}

export const appStore = new AppStore();

export function useAppState(): AppState {
  return useSyncExternalStore(
    appStore.subscribe,
    appStore.getSnapshot,
    appStore.getSnapshot,
  );
}
