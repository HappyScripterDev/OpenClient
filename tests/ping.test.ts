import { describe, expect, it } from "vitest";
import {
  buildHandshakePacket,
  buildStatusRequestPacket,
  decodeStatusPayload,
  flattenChat,
  parseAddress,
  parseStatusJson,
  readVarInt,
  writeString,
  writeVarInt,
} from "../electron/core/minecraftPing";
import {
  RAKNET_MAGIC,
  buildUnconnectedPing,
  parseBedrockAddress,
  parseUnconnectedPong,
} from "../electron/core/raknet";

function makePong(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  const buffer = Buffer.alloc(35 + payload.length);
  buffer.writeUInt8(0x1c, 0);
  buffer.writeBigInt64BE(123456789n, 1);
  buffer.writeBigInt64BE(987654321n, 9);
  RAKNET_MAGIC.copy(buffer, 17);
  buffer.writeUInt16BE(payload.length, 33);
  payload.copy(buffer, 35);
  return buffer;
}

describe("Java server ping", () => {
  it("round-trips VarInts", () => {
    for (const value of [0, 1, 127, 128, 300, 2147483]) {
      const encoded = writeVarInt(value);
      expect(readVarInt(encoded).value).toBe(value);
    }
  });

  it("builds a handshake with the protocol and address", () => {
    const packet = buildHandshakePacket("mc.example.net", 25565);
    expect(packet.readUInt8(1)).toBe(0x00);
    expect(packet.length).toBeGreaterThan(10);
    expect(buildStatusRequestPacket()).toEqual(Buffer.from([1, 0]));
  });

  it("decodes a status response", () => {
    const json = JSON.stringify({
      version: { name: "1.21.4", protocol: 769 },
      players: { online: 12, max: 100, sample: [{ name: "Alex" }] },
      description: { text: "Hello ", extra: [{ text: "world" }] },
      favicon: "data:image/png;base64,abc",
    });
    const payload = Buffer.concat([writeVarInt(0), writeString(json)]);
    const status = decodeStatusPayload(payload);
    expect(status.version).toBe("1.21.4");
    expect(status.playersOnline).toBe(12);
    expect(status.description).toBe("Hello world");
    expect(status.playerSample).toEqual(["Alex"]);
  });

  it("strips Minecraft formatting codes and flattens chat", () => {
    expect(flattenChat({ text: "\u00a7aHello", extra: [{ text: " there" }] })).toBe("Hello there");
    expect(parseStatusJson(JSON.stringify({ description: "Plain" })).description).toBe("Plain");
  });

  it("parses explicit ports and IPv6 addresses", () => {
    expect(parseAddress("mc.example.net:25566", 25565)).toEqual({
      host: "mc.example.net",
      port: 25566,
    });
    expect(parseAddress("[::1]:25570", 25565)).toEqual({ host: "::1", port: 25570 });
    expect(parseAddress("mc.example.net", 25565)).toEqual({
      host: "mc.example.net",
      port: 25565,
    });
  });
});

describe("Bedrock RakNet ping", () => {
  it("builds the unconnected ping packet", () => {
    const packet = buildUnconnectedPing(1000, 42n);
    expect(packet.length).toBe(33);
    expect(packet.readUInt8(0)).toBe(0x01);
    expect(packet.subarray(9, 25)).toEqual(RAKNET_MAGIC);
    expect(packet.readBigUInt64BE(25)).toBe(42n);
  });

  it("parses the unconnected pong", () => {
    const pong = parseUnconnectedPong(
      makePong("MCPE;Test Server;765;1.21.50;7;20;12345;Second line;Survival;1;19132;19133"),
    );
    expect(pong.motd).toBe("Test Server");
    expect(pong.subMotd).toBe("Second line");
    expect(pong.version).toBe("1.21.50");
    expect(pong.playersOnline).toBe(7);
    expect(pong.playersMax).toBe(20);
    expect(pong.gameMode).toBe("Survival");
    expect(pong.portV4).toBe(19132);
  });

  it("rejects malformed packets", () => {
    expect(() => parseUnconnectedPong(Buffer.from([0x1c, 1, 2, 3]))).toThrow();
    expect(parseBedrockAddress("[::1]:19133", 19132)).toEqual({
      host: "::1",
      port: 19133,
      isIpv6: true,
    });
  });
});
