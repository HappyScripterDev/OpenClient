import { EventEmitter } from "node:events";
import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { settingsService } from "./settings";
import { logger } from "./logger";
import type { UpdateState } from "../../src/shared/types";

class UpdaterService extends EventEmitter {
  private state: UpdateState = { status: "idle" };
  private configured = false;

  constructor() {
    super();
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => {
      this.setState({ status: "checking", message: "Checking for updates" });
    });
    autoUpdater.on("update-available", (info) => {
      this.setState({
        status: "available",
        version: info.version,
        message: `Version ${info.version} is available`,
      });
    });
    autoUpdater.on("update-not-available", () => {
      this.setState({ status: "idle", message: "OpenClient is up to date" });
    });
    autoUpdater.on("download-progress", (progress) => {
      this.setState({
        ...this.state,
        status: "downloading",
        percent: Math.round(progress.percent),
        message: `Downloading update ${Math.round(progress.percent)}%`,
      });
    });
    autoUpdater.on("update-downloaded", (info) => {
      this.setState({
        status: "ready",
        version: info.version,
        percent: 100,
        message: "Update ready. Restart to install.",
      });
    });
    autoUpdater.on("error", (error) => {
      logger.warn("updater", `Update error: ${error.message}`);
      this.setState({
        status: "error",
        message: error.message,
      });
    });
  }

  private setState(state: UpdateState): void {
    this.state = state;
    this.emit("state", state);
  }

  getState(): UpdateState {
    return this.state;
  }

  private async configure(): Promise<boolean> {
    if (!app.isPackaged) return false;
    const settings = await settingsService.load();
    const feed = settings.updateFeedUrl.trim();
    if (!feed) return false;
    if (!this.configured) {
      autoUpdater.setFeedURL({ provider: "generic", url: feed });
      this.configured = true;
    }
    return true;
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) {
      this.setState({
        status: "not-configured",
        message: "Automatic updates are available in packaged builds only.",
      });
      return this.state;
    }
    if (!(await this.configure())) {
      this.setState({
        status: "not-configured",
        message: "Set an update feed URL in Settings, Updates.",
      });
      return this.state;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return this.state;
  }

  async download(): Promise<UpdateState> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return this.state;
  }

  install(): void {
    if (this.state.status === "ready") {
      autoUpdater.quitAndInstall();
    }
  }

  async autoCheck(): Promise<void> {
    const settings = await settingsService.load();
    if (!settings.autoCheckUpdates) return;
    await this.check();
  }
}

export const updaterService = new UpdaterService();
