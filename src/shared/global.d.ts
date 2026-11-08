import type { WindowState } from "./ipc";

declare global {
  interface Window {
    openclient: import("./ipc").OpenClientApi;
  }
}

export type { WindowState };
