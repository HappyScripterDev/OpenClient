export function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return Buffer.from(bytes);
}

export function readVarInt(
  buffer: Buffer,
  offset = 0,
): { value: number; size: number } {
  let value = 0;
  let position = 0;
  let current = 0;
  while (true) {
    if (offset + position >= buffer.length) {
      throw new Error("Unexpected end of VarInt");
    }
    current = buffer[offset + position];
    value |= (current & 0x7f) << (7 * position);
    position += 1;
    if ((current & 0x80) === 0) break;
    if (position > 5) throw new Error("VarInt is too long");
  }
  return { value: value >>> 0, size: position };
}

export function writeString(value: string): Buffer {
  const data = Buffer.from(value, "utf8");
  return Buffer.concat([writeVarInt(data.length), data]);
}

export function readString(
  buffer: Buffer,
  offset: number,
): { value: string; size: number } {
  const length = readVarInt(buffer, offset);
  const start = offset + length.size;
  const end = start + length.value;
  if (end > buffer.length) throw new Error("String exceeds packet");
  return {
    value: buffer.subarray(start, end).toString("utf8"),
    size: length.size + length.value,
  };
}

export function buildHandshakePacket(
  host: string,
  port: number,
  protocolVersion = 767,
): Buffer {
  const payload = Buffer.concat([
    writeVarInt(0x00),
    writeVarInt(protocolVersion),
    writeString(host),
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(1),
  ]);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

export function buildStatusRequestPacket(): Buffer {
  return Buffer.from([0x01, 0x00]);
}

export interface StatusResponse {
  version: string;
  protocol: number;
  playersOnline: number;
  playersMax: number;
  playerSample: string[];
  description: string;
  favicon?: string;
}

export function decodeStatusPayload(payload: Buffer): StatusResponse {
  const packetId = readVarInt(payload, 0);
  if (packetId.value !== 0x00) {
    throw new Error(`Unexpected status packet id ${packetId.value}`);
  }
  const json = readString(payload, packetId.size).value;
  return parseStatusJson(json);
}

export function parseStatusJson(json: string): StatusResponse {
  const parsed = JSON.parse(json) as {
    version?: { name?: string; protocol?: number };
    players?: {
      online?: number;
      max?: number;
      sample?: { name?: string }[];
    };
    description?: unknown;
    favicon?: string;
  };
  return {
    version: parsed.version?.name ?? "Unknown",
    protocol: parsed.version?.protocol ?? 0,
    playersOnline: parsed.players?.online ?? 0,
    playersMax: parsed.players?.max ?? 0,
    playerSample: (parsed.players?.sample ?? [])
      .map((entry) => entry.name ?? "")
      .filter(Boolean),
    description: flattenChat(parsed.description),
    favicon: parsed.favicon,
  };
}

export function flattenChat(component: unknown): string {
  if (component === null || component === undefined) return "";
  if (typeof component === "string") return stripFormatting(component);
  if (typeof component === "number" || typeof component === "boolean") {
    return String(component);
  }
  if (Array.isArray(component)) {
    return component.map(flattenChat).join("");
  }
  if (typeof component === "object") {
    const record = component as Record<string, unknown>;
    let output = "";
    if (typeof record.text === "string") output += record.text;
    if (typeof record.translate === "string" && !record.text) {
      output += record.translate;
    }
    if (Array.isArray(record.with)) {
      const args = record.with.map(flattenChat).filter(Boolean).join(" ");
      if (args) output += args;
    }
    if (Array.isArray(record.extra)) {
      output += record.extra.map(flattenChat).join("");
    }
    return stripFormatting(output);
  }
  return "";
}

export function stripFormatting(input: string): string {
  return input.replace(/\u00a7[0-9a-fk-orx]/gi, "");
}

export function parseAddress(
  input: string,
  defaultPort: number,
): { host: string; port: number } {
  const trimmed = input.trim();
  if (!trimmed) return { host: "", port: defaultPort };
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end !== -1) {
      const host = trimmed.slice(1, end);
      const rest = trimmed.slice(end + 1);
      const port = rest.startsWith(":") ? Number(rest.slice(1)) : defaultPort;
      return { host, port: Number.isFinite(port) ? port : defaultPort };
    }
  }
  const parts = trimmed.split(":");
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    const port = Number(parts[1]);
    return { host: parts[0], port: Number.isFinite(port) ? port : defaultPort };
  }
  return { host: trimmed, port: defaultPort };
}
