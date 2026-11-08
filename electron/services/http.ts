import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { EventEmitter } from "node:events";
import { ensureDir } from "./paths";
import { fileMatches, removeFileIfExists } from "./files";
import { USER_AGENT } from "../../src/shared/constants";
import type { DownloadProgress } from "../../src/shared/types";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retries = 3,
  timeoutMs = 30000,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetch(url, {
        ...init,
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          ...(init.headers ?? {}),
        },
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          await delay(600 * (attempt + 1));
          continue;
        }
      }
      if (!response.ok) {
        throw new HttpError(
          `Request failed with HTTP ${response.status}`,
          response.status,
          url,
        );
      }
      return response;
    } catch (error) {
      lastError = error;
      if (error instanceof HttpError && error.status < 500 && error.status !== 429) {
        throw error;
      }
      if (attempt < retries) await delay(600 * (attempt + 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Network request failed");
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  retries = 3,
): Promise<T> {
  const response = await fetchWithRetry(url, init, retries);
  return (await response.json()) as T;
}

export async function fetchBuffer(
  url: string,
  timeoutMs = 60000,
): Promise<Buffer> {
  const response = await fetchWithRetry(url, {}, 3, timeoutMs);
  return Buffer.from(await response.arrayBuffer());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DownloadTask {
  url: string;
  destination: string;
  sha1?: string;
  sha512?: string;
  md5?: string;
  size?: number;
  label?: string;
}

interface JobState {
  jobId: string;
  stage: string;
  label: string;
  filesTotal: number;
  filesDone: number;
  bytesReceived: number;
  bytesTotal: number;
  lastEmit: number;
  errors: string[];
  aborted: boolean;
}

export class DownloadManager extends EventEmitter {
  async downloadBatch(
    jobId: string,
    stage: string,
    label: string,
    tasks: DownloadTask[],
    concurrency = 8,
  ): Promise<{ errors: string[]; bytes: number }> {
    const state: JobState = {
      jobId,
      stage,
      label,
      filesTotal: tasks.length,
      filesDone: 0,
      bytesReceived: 0,
      bytesTotal: tasks.reduce((sum, task) => sum + (task.size ?? 0), 0),
      lastEmit: 0,
      errors: [],
      aborted: false,
    };
    this.emitProgress(state, false);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, tasks.length || 1)) },
      async () => {
        while (cursor < tasks.length) {
          const index = cursor;
          cursor += 1;
          const task = tasks[index];
          try {
            const bytes = await this.downloadOne(task, state);
            state.filesDone += 1;
            state.bytesReceived += bytes;
            this.emitProgress(state, false, true);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            state.errors.push(`${task.label ?? path.basename(task.destination)}: ${message}`);
            state.filesDone += 1;
            this.emitProgress(state, false, true);
          }
        }
      },
    );
    await Promise.all(workers);
    this.emitProgress(state, true);
    return { errors: state.errors, bytes: state.bytesReceived };
  }

  async downloadOne(task: DownloadTask, state?: JobState): Promise<number> {
    ensureDir(path.dirname(task.destination));
    const existsOk = await fileMatches(task.destination, {
      sha1: task.sha1,
      sha512: task.sha512,
      md5: task.md5,
      size: task.size,
    });
    if (existsOk) {
      return task.size ?? 0;
    }
    const partial = `${task.destination}.part`;
    let start = 0;
    try {
      const stat = await fs.promises.stat(partial);
      start = stat.size;
    } catch {
      start = 0;
    }
    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    if (start > 0) headers.Range = `bytes=${start}-`;
    let response: Response | null = null;
    try {
      response = await fetchWithRetry(task.url, { headers }, 2, 120000);
    } catch (error) {
      await removeFileIfExists(partial);
      throw error;
    }
    if (start > 0 && response.status !== 206) {
      start = 0;
    }
    const totalFromServer = Number(response.headers.get("content-length") ?? 0);
    if (state) {
      state.bytesTotal = Math.max(
        state.bytesTotal,
        state.bytesReceived + start + (totalFromServer || task.size || 0),
      );
    }
    if (state && response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as unknown as import("node:stream/web").ReadableStream,
      );
      let received = start;
      nodeStream.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (state) {
          state.bytesReceived += chunk.length;
          this.emitProgress(state, false);
        }
      });
      const writeStream = fs.createWriteStream(partial, {
        flags: start > 0 ? "a" : "w",
      });
      try {
        await pipeline(nodeStream, writeStream);
      } catch (error) {
        throw new Error(
          `Transfer interrupted: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.promises.writeFile(partial, buffer);
    } else {
      throw new Error("Empty response body");
    }
    if (task.sha1 || task.sha512 || task.md5) {
      const valid = await fileMatches(partial, {
        sha1: task.sha1,
        sha512: task.sha512,
        md5: task.md5,
      });
      if (!valid) {
        await removeFileIfExists(partial);
        throw new Error("Checksum mismatch, download discarded");
      }
    }
    if (task.size && !task.sha1 && !task.sha512 && !task.md5) {
      const stat = await fs.promises.stat(partial);
      if (stat.size !== task.size) {
        await removeFileIfExists(partial);
        throw new Error(
          `Size mismatch (${stat.size} bytes, expected ${task.size})`,
        );
      }
    }
    await fs.promises.rename(partial, task.destination);
    return (await fs.promises.stat(task.destination)).size;
  }

  private emitProgress(state: JobState, done: boolean, force = false): void {
    const now = Date.now();
    if (!force && !done && now - state.lastEmit < 120) return;
    state.lastEmit = now;
    const progress: DownloadProgress = {
      jobId: state.jobId,
      stage: state.stage,
      label: state.label,
      completed: state.filesDone,
      total: state.filesTotal,
      bytesReceived: state.bytesReceived,
      bytesTotal: state.bytesTotal,
      filesDone: state.filesDone,
      filesTotal: state.filesTotal,
      done,
      error: state.errors[0],
    };
    this.emit("progress", progress);
  }
}

export const downloads = new DownloadManager();
