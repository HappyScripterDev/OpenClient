import { describe, expect, it } from "vitest";
import {
  parseOptionsText,
  patchOptionsText,
  readOptionsMap,
  serializeOptions,
} from "../electron/core/options";

describe("options.txt handling", () => {
  const original = [
    "version:3955",
    "renderDistance:12",
    "enableVsync:true",
    "",
    "maxFps:120",
  ].join("\n");

  it("parses keys and preserves order", () => {
    const document = parseOptionsText(original);
    expect([...document.values.keys()]).toEqual([
      "version",
      "renderDistance",
      "enableVsync",
      "maxFps",
    ]);
  });

  it("patches values and adds new keys", () => {
    const patched = patchOptionsText(original, {
      renderDistance: 6,
      enableVsync: false,
      simulationDistance: 5,
    });
    const map = readOptionsMap(patched);
    expect(map.renderDistance).toBe("6");
    expect(map.enableVsync).toBe("false");
    expect(map.simulationDistance).toBe("5");
    expect(patched.endsWith("\n")).toBe(true);
  });

  it("preserves unknown keys and comments", () => {
    const text = "# comment\nfoo:bar\nrenderDistance:12\n";
    const document = parseOptionsText(text);
    document.values.set("foo", "baz");
    const serialized = serializeOptions(document);
    expect(serialized).toContain("# comment");
    expect(serialized).toContain("foo:baz");
    expect(serialized).toContain("renderDistance:12");
  });

  it("does not duplicate an existing key when adding a patch", () => {
    const patched = patchOptionsText(original, { renderDistance: 8 });
    expect(patched.match(/renderDistance:/g)).toHaveLength(1);
  });
});
