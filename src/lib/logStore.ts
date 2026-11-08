import { useSyncExternalStore } from "react";
import type { LogEntry } from "../shared/types";

class LogBuffer {
  private entries: LogEntry[] = [];
  private listeners = new Set<() => void>();
  private snapshot: LogEntry[] = [];

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LogEntry[] => this.snapshot;

  push(entry: LogEntry): void {
    this.entries = [...this.entries, entry];
    if (this.entries.length > 3000) {
      this.entries = this.entries.slice(this.entries.length - 3000);
    }
    this.snapshot = this.entries;
    this.listeners.forEach((listener) => listener());
  }

  replace(entries: LogEntry[]): void {
    this.entries = entries.slice(-3000);
    this.snapshot = this.entries;
    this.listeners.forEach((listener) => listener());
  }

  clear(): void {
    this.entries = [];
    this.snapshot = this.entries;
    this.listeners.forEach((listener) => listener());
  }

  getEntries(): LogEntry[] {
    return this.entries;
  }
}

export const logBuffer = new LogBuffer();

export function useLogs(): LogEntry[] {
  return useSyncExternalStore(
    logBuffer.subscribe,
    logBuffer.getSnapshot,
    logBuffer.getSnapshot,
  );
}
