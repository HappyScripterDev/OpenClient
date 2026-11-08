import dgram from "node:dgram";
import net from "node:net";
import dns from "node:dns";
import { EventEmitter } from "node:events";
import {
  serversFile,
  ensureDir,
} from "./paths";
import { readJsonFile, writeJsonFile } from "./files";
import { randomId } from "./paths";
import { profilesService } from "./profiles";
import { launchService } from "./launch";
import { bedrockService } from "./bedrock";
import { settingsService } from "./settings";
import { KNOWN_CROSSPLAY_SERVERS } from "../../src/shared/defaults";
import {
  buildHandshakePacket,
  buildStatusRequestPacket,
  decodeStatusPayload,
  parseAddress,
  readVarInt,
} from "../core/minecraftPing";
import {
  buildUnconnectedPing,
  parseBedrockAddress,
  parseUnconnectedPong,
} from "../core/raknet";
import type {
  ServerEntry,
  ServerPingResult,
} from "../../src/shared/types";

interface ServerDocument {
  schemaVersion: number;
  servers: ServerEntry[];
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function resolveJavaSrv(
  host: string,
  port: number,
  explicitPort: boolean,
): Promise<{ host: string; port: number }> {
  if (explicitPort) return { host, port };
  if (net.isIP(host)) return { host, port };
  const records = await timeout(
    dns.promises.resolveSrv(`_minecraft._tcp.${host}`),
    2500,
  );
  if (records && records.length > 0) {
    records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
    return { host: records[0].name, port: records[0].port };
  }
  return { host, port };
}

async function resolveBedrockSrv(
  host: string,
  port: number,
  explicitPort: boolean,
): Promise<{ host: string; port: number }> {
  if (explicitPort) return { host, port };
  if (net.isIP(host)) return { host, port };
  const records = await timeout(
    dns.promises.resolveSrv(`_minecraft._udp.${host}`),
    2500,
  );
  if (records && records.length > 0) {
    records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
    return { host: records[0].name, port: records[0].port };
  }
  return { host, port };
}

function hasExplicitPort(address: string): boolean {
  const trimmed = address.trim();
  if (trimmed.startsWith("[")) return trimmed.includes("]:");
  return trimmed.split(":").length === 2 && /^\d+$/.test(trimmed.split(":")[1]);
}

export async function pingJavaServer(
  rawAddress: string,
  port: number,
): Promise<ServerPingResult> {
  const parsed = parseAddress(rawAddress, port || 25565);
  const explicit = hasExplicitPort(rawAddress);
  const target = await resolveJavaSrv(parsed.host, parsed.port, explicit);
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ServerPingResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const socket = net.createConnection({
      host: target.host,
      port: target.port,
    });
    socket.setTimeout(8000);
    socket.setNoDelay(true);
    let buffer = Buffer.alloc(0);
    socket.on("connect", () => {
      socket.write(
        Buffer.concat([
          buildHandshakePacket(parsed.host, target.port),
          buildStatusRequestPacket(),
        ]),
      );
    });
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const length = readVarInt(buffer, 0);
        const total = length.size + length.value;
        if (buffer.length < total) return;
        const payload = buffer.subarray(length.size, total);
        const status = decodeStatusPayload(payload);
        finish({
          online: true,
          edition: "java",
          address: parsed.host,
          port: target.port,
          latencyMs: Date.now() - started,
          motd: status.description,
          version: status.version,
          playersOnline: status.playersOnline,
          playersMax: status.playersMax,
          playerSample: status.playerSample,
          iconDataUrl: status.favicon,
          checkedAt: Date.now(),
        });
      } catch (error) {
        finish({
          online: false,
          edition: "java",
          address: parsed.host,
          port: target.port,
          latencyMs: Date.now() - started,
          motd: "",
          version: "",
          playersOnline: 0,
          playersMax: 0,
          playerSample: [],
          checkedAt: Date.now(),
          error: error instanceof Error ? error.message : "Invalid response",
        });
      }
    });
    socket.on("timeout", () => {
      finish({
        online: false,
        edition: "java",
        address: parsed.host,
        port: target.port,
        latencyMs: Date.now() - started,
        motd: "",
        version: "",
        playersOnline: 0,
        playersMax: 0,
        playerSample: [],
        checkedAt: Date.now(),
        error: "Connection timed out",
      });
    });
    socket.on("error", (error) => {
      finish({
        online: false,
        edition: "java",
        address: parsed.host,
        port: target.port,
        latencyMs: Date.now() - started,
        motd: "",
        version: "",
        playersOnline: 0,
        playersMax: 0,
        playerSample: [],
        checkedAt: Date.now(),
        error: error.message,
      });
    });
  });
}

export async function pingBedrockServer(
  rawAddress: string,
  port: number,
): Promise<ServerPingResult> {
  const parsed = parseBedrockAddress(rawAddress, port || 19132);
  const explicit = hasExplicitPort(rawAddress);
  const target = await resolveBedrockSrv(parsed.host, parsed.port, explicit);
  const started = Date.now();
  const guid = BigInt(`0x${randomId().replace(/[^0-9a-f]/gi, "").padEnd(16, "0").slice(0, 16)}`);
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const finish = (result: ServerPingResult): void => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        void 0;
      }
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({
        online: false,
        edition: "bedrock",
        address: parsed.host,
        port: target.port,
        latencyMs: Date.now() - started,
        motd: "",
        version: "",
        playersOnline: 0,
        playersMax: 0,
        playerSample: [],
        checkedAt: Date.now(),
        error: "No response from the server",
      });
    }, 5000);
    socket.on("message", (message) => {
      clearTimeout(timer);
      try {
        const pong = parseUnconnectedPong(message);
        finish({
          online: true,
          edition: "bedrock",
          address: parsed.host,
          port: target.port,
          latencyMs: Date.now() - started,
          motd: [pong.motd, pong.subMotd].filter(Boolean).join(" "),
          version: pong.version,
          playersOnline: pong.playersOnline,
          playersMax: pong.playersMax,
          playerSample: [],
          checkedAt: Date.now(),
        });
      } catch (error) {
        finish({
          online: false,
          edition: "bedrock",
          address: parsed.host,
          port: target.port,
          latencyMs: Date.now() - started,
          motd: "",
          version: "",
          playersOnline: 0,
          playersMax: 0,
          playerSample: [],
          checkedAt: Date.now(),
          error: error instanceof Error ? error.message : "Invalid response",
        });
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      finish({
        online: false,
        edition: "bedrock",
        address: parsed.host,
        port: target.port,
        latencyMs: Date.now() - started,
        motd: "",
        version: "",
        playersOnline: 0,
        playersMax: 0,
        playerSample: [],
        checkedAt: Date.now(),
        error: error.message,
      });
    });
    socket.bind(() => {
      try {
        socket.send(
          buildUnconnectedPing(Date.now(), guid),
          target.port,
          target.host,
        );
      } catch (error) {
        clearTimeout(timer);
        finish({
          online: false,
          edition: "bedrock",
          address: parsed.host,
          port: target.port,
          latencyMs: Date.now() - started,
          motd: "",
          version: "",
          playersOnline: 0,
          playersMax: 0,
          playerSample: [],
          checkedAt: Date.now(),
          error: error instanceof Error ? error.message : "Send failed",
        });
      }
    });
  });
}

class ServerService extends EventEmitter {
  private servers: ServerEntry[] = [];
  private loaded = false;

  async load(): Promise<ServerEntry[]> {
    if (this.loaded) return this.servers;
    const document = await readJsonFile<ServerDocument>(serversFile(), {
      schemaVersion: 1,
      servers: [],
    });
    this.servers = document.servers;
    if (this.servers.length === 0) {
      this.servers = KNOWN_CROSSPLAY_SERVERS.map((server) => ({
        id: randomId("server"),
        name: server.name,
        address: server.address,
        port: server.port,
        edition: server.edition,
        crossPlay: server.crossPlay,
        favorite: server.name === "The Hive",
        notes: "",
        addedAt: Date.now(),
      }));
      await this.persist();
    }
    this.loaded = true;
    return this.servers;
  }

  list(): ServerEntry[] {
    return [...this.servers].sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
    );
  }

  async add(input: Omit<ServerEntry, "id" | "addedAt">): Promise<ServerEntry> {
    await this.load();
    const address = input.address.trim().replace(/^minecraft:\/\//i, "");
    if (!address) throw new Error("Server address is required");
    const entry: ServerEntry = {
      ...input,
      address,
      name: input.name.trim() || address,
      port: input.port || (input.edition === "bedrock" ? 19132 : 25565),
      id: randomId("server"),
      addedAt: Date.now(),
    };
    this.servers.push(entry);
    await this.persist();
    this.emit("changed", this.list());
    return entry;
  }

  async update(id: string, patch: Partial<ServerEntry>): Promise<ServerEntry> {
    await this.load();
    const index = this.servers.findIndex((server) => server.id === id);
    if (index === -1) throw new Error("Server not found");
    const next = { ...this.servers[index], ...patch, id: this.servers[index].id };
    this.servers[index] = next;
    await this.persist();
    this.emit("changed", this.list());
    return next;
  }

  async remove(id: string): Promise<void> {
    await this.load();
    this.servers = this.servers.filter((server) => server.id !== id);
    await this.persist();
    this.emit("changed", this.list());
  }

  async ping(id: string): Promise<ServerPingResult> {
    await this.load();
    const server = this.servers.find((entry) => entry.id === id);
    if (!server) throw new Error("Server not found");
    return this.pingAddress(server.edition === "bedrock" ? "bedrock" : "java", server.address, server.port);
  }

  async pingAddress(
    edition: "java" | "bedrock",
    address: string,
    port: number,
  ): Promise<ServerPingResult> {
    return edition === "java"
      ? pingJavaServer(address, port)
      : pingBedrockServer(address, port);
  }

  async join(
    id: string,
    profileId?: string,
  ): Promise<import("../../src/shared/types").LaunchResult | null> {
    await this.load();
    const server = this.servers.find((entry) => entry.id === id);
    if (!server) throw new Error("Server not found");
    let profile = profileId ? profilesService.find(profileId) : undefined;
    if (!profile && server.edition !== "bedrock") {
      const settings = await settingsService.load();
      profile = profilesService.find(settings.selectedJavaProfileId) ?? undefined;
    }
    if (profile && profile.edition === "java" && server.edition !== "bedrock") {
      await this.update(id, { lastPlayed: Date.now() });
      return launchService.launch(profile.id, {
        server: server.address,
        port: server.port,
      });
    }
    if (server.edition !== "java") {
      await this.update(id, { lastPlayed: Date.now() });
      await bedrockService.launch(
        bedrockService.addServerUri(server.name, server.address, server.port),
      );
      return null;
    }
    throw new Error(
      "This is a Java Edition server. Select a Java profile to join it.",
    );
  }

  private async persist(): Promise<void> {
    ensureDir(serversFile().replace(/[^\\/]+$/, ""));
    await writeJsonFile(serversFile(), {
      schemaVersion: 1,
      servers: this.servers,
    } satisfies ServerDocument);
  }
}

export const serverService = new ServerService();
