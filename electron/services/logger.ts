import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { appRoot, launcherLogFile, ensureDir } from "./paths";
import type { LogEntry } from "../../src/shared/types";

class LauncherLogger extends EventEmitter {
  private entries: LogEntry[] = [];
  private sequence = 0;

  constructor() {
    super();
    ensureDir(path.join(appRoot(), "logs"));
  }

  private write(level: LogEntry["level"], source: string, message: string): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${this.sequence++}`,
      timestamp: Date.now(),
      level,
      source,
      message,
    };
    this.entries.push(entry);
    if (this.entries.length > 3000) {
      this.entries.splice(0, this.entries.length - 3000);
    }
    const line = `[${new Date(entry.timestamp).toISOString()}] [${level.toUpperCase()}] [${source}] ${message}`;
    try {
      fs.appendFileSync(launcherLogFile(), `${line}\n`, "utf8");
    } catch {
      void 0;
    }
    this.emit("entry", entry);
  }

  info(source: string, message: string): void {
    this.write("info", source, message);
  }

  warn(source: string, message: string): void {
    this.write("warn", source, message);
  }

  error(source: string, message: string): void {
    this.write("error", source, message);
  }

  debug(source: string, message: string): void {
    this.write("debug", source, message);
  }

  game(source: string, message: string): void {
    this.write("game", source, message);
  }

  list(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    try {
      fs.writeFileSync(launcherLogFile(), "", "utf8");
    } catch {
      void 0;
    }
    this.emit("cleared");
  }
}

export const logger = new LauncherLogger();
