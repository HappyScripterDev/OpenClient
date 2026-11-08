import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { appRoot, ensureDir } from "./services/paths";
import { settingsService } from "./services/settings";
import { logger } from "./services/logger";
import { APP_NAME } from "../src/shared/constants";
import type { WindowState } from "../src/shared/ipc";

interface SavedWindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let saveTimer: NodeJS.Timeout | null = null;

function stateFile(): string {
  return path.join(appRoot(), "window-state.json");
}

function readState(): SavedWindowState {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8")) as SavedWindowState;
  } catch {
    return { width: 1360, height: 860, maximized: false };
  }
}

function writeState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.isMaximized()
    ? mainWindow.getNormalBounds()
    : mainWindow.getBounds();
  const state: SavedWindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: mainWindow.isMaximized(),
  };
  try {
    ensureDir(appRoot());
    fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));
  } catch {
    void 0;
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(writeState, 400);
}

export function iconPath(): string {
  return path.join(__dirname, "..", "assets", "OcTransparent.png");
}

function splashHtml(): string {
  const version = app.getVersion();
  const icon = nativeImage.createFromPath(iconPath());
  const dataUrl = icon.isEmpty() ? "" : icon.toDataURL();
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; font-family: "Segoe UI", system-ui, sans-serif; }
  .card {
    width: 100%; height: 100%; border-radius: 22px;
    background: rgba(15, 15, 23, 0.92);
    border: 1px solid rgba(255,255,255,0.09);
    box-shadow: 0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; color: #f4f4f7; -webkit-app-region: drag;
  }
  img { width: 96px; height: 96px; object-fit: contain; filter: drop-shadow(0 12px 30px rgba(124,108,255,0.35)); }
  .name { font-size: 24px; font-weight: 700; letter-spacing: 0.2px; }
  .version { font-size: 11px; color: rgba(244,244,247,0.45); letter-spacing: 0.14em; text-transform: uppercase; }
  .track { width: 190px; height: 4px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; margin-top: 8px; }
  .bar { width: 40%; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #7c6cff, #4fd1c5); animation: slide 1.15s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(370%); } }
</style>
</head>
<body>
  <div class="card">
    ${dataUrl ? `<img src="${dataUrl}" alt="" />` : ""}
    <div class="name">OpenClient</div>
    <div class="version">version ${version}</div>
    <div class="track"><div class="bar"></div></div>
  </div>
</body>
</html>`;
}

export function createSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) return;
  splashWindow = new BrowserWindow({
    width: 380,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    icon: iconPath(),
    webPreferences: { sandbox: true },
  });
  splashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`,
  );
  splashWindow.once("ready-to-show", () => splashWindow?.show());
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

export function windowState(): WindowState {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { maximized: false, focused: false, fullscreen: false };
  }
  return {
    maximized: mainWindow.isMaximized(),
    focused: mainWindow.isFocused(),
    fullscreen: mainWindow.isFullScreen(),
  };
}

function sendWindowState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("event:window-state", windowState());
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

export function setQuitting(value: boolean): void {
  quitting = value;
}

export function isQuitting(): boolean {
  return quitting;
}

export function createMainWindow(): BrowserWindow {
  const saved = readState();
  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.min(Math.max(saved.width, 1100), display.width);
  const height = Math.min(Math.max(saved.height, 700), display.height);
  const x =
    saved.x !== undefined
      ? Math.min(Math.max(saved.x, display.x - 40), display.x + display.width - 200)
      : undefined;
  const y =
    saved.y !== undefined
      ? Math.min(Math.max(saved.y, display.y - 20), display.y + display.height - 120)
      : undefined;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
    transparent: true,
    backgroundColor: "#00000000",
    roundedCorners: true,
    show: false,
    icon: iconPath(),
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  const devUrl = process.env["VITE_DEV_SERVER_URL"];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logger.info("renderer", `[${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on("did-finish-load", () => logger.info("window", "Renderer finished loading"));
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    logger.error("window", `Renderer failed to load ${url}: ${code} ${description}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logger.error("window", `Renderer process gone: ${details.reason} (${details.exitCode})`);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const dev = process.env["VITE_DEV_SERVER_URL"];
    if (dev && url.startsWith(dev)) return;
    if (url.startsWith("file://")) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      logger.warn("window", "Showing window after ready-to-show timeout");
      closeSplash();
      mainWindow.show();
    }
  }, 4500);

  mainWindow.once("ready-to-show", () => {
    closeSplash();
    if (saved.maximized) mainWindow?.maximize();
    mainWindow?.show();
    sendWindowState();
  });

  mainWindow.on("maximize", () => {
    sendWindowState();
    scheduleSave();
  });
  mainWindow.on("unmaximize", () => {
    sendWindowState();
    scheduleSave();
  });
  mainWindow.on("enter-full-screen", sendWindowState);
  mainWindow.on("leave-full-screen", sendWindowState);
  mainWindow.on("focus", sendWindowState);
  mainWindow.on("blur", sendWindowState);
  mainWindow.on("resize", scheduleSave);
  mainWindow.on("move", scheduleSave);
  mainWindow.on("close", (event) => {
    const settings = settingsService.get();
    if (!quitting && settings.closeToTray) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    writeState();
  });
  const minimizeEvents = mainWindow as unknown as {
    on(event: "minimize", listener: (event: Electron.Event) => void): void;
  };
  minimizeEvents.on("minimize", (event) => {
    const settings = settingsService.get();
    if (settings.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  logger.info("window", "Main window created");
  return mainWindow;
}

function trayImage(): Electron.NativeImage {
  const candidates = [
    path.join(__dirname, "..", "build", "tray.png"),
    path.join(__dirname, "..", "build", "icons", "32x32.png"),
    iconPath(),
  ];
  for (const candidate of candidates) {
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image.resize({ width: 16, height: 16 });
  }
  return nativeImage.createEmpty();
}

export function createTray(): void {
  if (tray) return;
  const image = trayImage();
  if (image.isEmpty()) return;
  tray = new Tray(image);
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    { label: "Show OpenClient", click: () => showMainWindow() },
    {
      label: "Open data folder",
      click: () => {
        ensureDir(appRoot());
        void shell.openPath(appRoot());
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showMainWindow();
  });
}

export function applyLoginItem(openAtLogin: boolean): void {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin });
  } catch {
    void 0;
  }
}
