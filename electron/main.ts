import { app, session } from "electron";
import { settingsService } from "./services/settings";
import { profilesService } from "./services/profiles";
import { versionService } from "./services/versions";
import { logger } from "./services/logger";
import { updaterService } from "./services/updater";
import { ensureDir, resolveDataRoot } from "./services/paths";
import {
  applyLoginItem,
  createMainWindow,
  createSplash,
  createTray,
  setQuitting,
  showMainWindow,
} from "./windows";
import { registerIpc } from "./ipc";
import { APP_ID, APP_NAME } from "../src/shared/constants";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
  app.setName(APP_NAME);
  if (process.platform === "win32") app.setAppUserModelId(APP_ID);

  app.on("before-quit", () => setQuitting(true));
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => showMainWindow());

  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });

  app
    .whenReady()
    .then(async () => {
      createSplash();
      const settings = await settingsService.load();
      ensureDir(resolveDataRoot(settings));
      const latest = await Promise.race([
        versionService.latestReleaseOrFallback(),
        new Promise<string>((resolve) => setTimeout(() => resolve("1.21.4"), 3000)),
      ]);
      await profilesService.ensureDefaults(latest);
      await profilesService.load();
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, permission, callback) => {
          callback(
            permission === "clipboard-sanitized-write" ||
              permission === "clipboard-read",
          );
        },
      );
      createMainWindow();
      registerIpc();
      createTray();
      applyLoginItem(settingsService.get().launchOnStartup);
      logger.info("app", `${APP_NAME} ${app.getVersion()} ready on ${process.platform}`);
      setTimeout(() => {
        updaterService.autoCheck().catch(() => undefined);
      }, 6000);
    })
    .catch((error) => {
      logger.error(
        "app",
        `Startup failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
      app.quit();
    });
}
