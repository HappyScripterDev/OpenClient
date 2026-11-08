import { useSyncExternalStore } from "react";
import type { DownloadProgress } from "../shared/types";

class TransferStore {
  private progress: DownloadProgress | null = null;
  private listeners = new Set<() => void>();
  private clearTimer: number | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): DownloadProgress | null => this.progress;

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  set(progress: DownloadProgress): void {
    if (this.clearTimer !== null) {
      window.clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    this.progress = progress;
    this.emit();
    if (progress.done) {
      this.clearTimer = window.setTimeout(() => {
        this.progress = null;
        this.clearTimer = null;
        this.emit();
      }, 1600);
    }
  }

  clear(): void {
    if (this.clearTimer !== null) {
      window.clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    this.progress = null;
    this.emit();
  }
}

export const transferStore = new TransferStore();

export function useTransfer(): DownloadProgress | null {
  return useSyncExternalStore(
    transferStore.subscribe,
    transferStore.getSnapshot,
    transferStore.getSnapshot,
  );
}
