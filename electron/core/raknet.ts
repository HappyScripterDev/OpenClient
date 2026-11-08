import { stripFormatting } from "./minecraftPing";

export const RAKNET_MAGIC = Buffer.from(
  "00ffff00fefefefefdfdfdfd12345678",
  "hex",
);

export interface BedrockAdvertisement {
  motd: string;
  subMotd: string;
  protocol: number;
  version: string;
  playersOnline: number;
  playersMax: number;
  serverId: string;
  gameMode: string;
  gameModeId: number;
  portV4: number;
  portV6: number;
}

export function buildUnconnectedPing(
  timestamp: number,
  clientGuid: bigint,
): Buffer {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt8(0x01, 0);
  buffer.writeBigInt64BE(BigInt(timestamp), 1);
  RAKNET_MAGIC.copy(buffer, 9);
  buffer.writeBigUInt64BE(clientGuid, 25);
  return buffer;
}

export function parseUnconnectedPong(
  packet: Buffer,
): BedrockAdvertisement & { pingTime: bigint; serverGuid: bigint } {
  if (packet.length < 35 || packet[0] !== 0x1c) {
    throw new Error("Not a RakNet unconnected pong");
  }
  const pingTime = packet.readBigInt64BE(1);
  const serverGuid = packet.readBigInt64BE(9);
  const magic = packet.subarray(17, 33);
  if (!magic.equals(RAKNET_MAGIC)) {
    throw new Error("Invalid RakNet magic");
  }
  const length = packet.readUInt16BE(33);
  if (33 + 2 + length > packet.length) {
    throw new Error("Pong string exceeds packet size");
  }
  const text = packet.subarray(35, 35 + length).toString("utf8");
  const fields = text.split(";");
  const number = (value: string | undefined, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    motd: stripFormatting(fields[1] ?? ""),
    protocol: number(fields[2]),
    version: fields[3] ?? "Unknown",
    playersOnline: number(fields[4]),
    playersMax: number(fields[5]),
    serverId: fields[6] ?? "",
    subMotd: stripFormatting(fields[7] ?? ""),
    gameMode: fields[8] ?? "",
    gameModeId: number(fields[9]),
    portV4: number(fields[10]),
    portV6: number(fields[11]),
    pingTime,
    serverGuid,
  };
}

export function parseBedrockAddress(
  input: string,
  defaultPort: number,
): { host: string; port: number; isIpv6: boolean } {
  const trimmed = input.trim();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end !== -1) {
      const host = trimmed.slice(1, end);
      const rest = trimmed.slice(end + 1);
      const port = rest.startsWith(":") ? Number(rest.slice(1)) : defaultPort;
      return { host, port, isIpv6: true };
    }
  }
  const parts = trimmed.split(":");
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    return { host: parts[0], port: Number(parts[1]), isIpv6: false };
  }
  return { host: trimmed, port: defaultPort, isIpv6: false };
}
