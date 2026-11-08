import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_PRESETS,
  presetSupportsVersion,
  GameVersion,
  isModAvailableForVersion,
} from "../src/shared/performance-presets";

const ultra = PERFORMANCE_PRESETS.find((preset) => preset.id === "ultra");
if (!ultra) throw new Error("Ultra preset missing");

describe("performance presets", () => {
  it("compares Minecraft versions", () => {
    expect(new GameVersion("1.21.4").atLeast("1.20.5")).toBe(true);
    expect(new GameVersion("1.20.1").atMost("1.20.4")).toBe(true);
    expect(new GameVersion("1.18").compare(new GameVersion("1.18.0"))).toBe(0);
  });

  it("checks preset version bounds", () => {
    expect(presetSupportsVersion(ultra, "1.21.1")).toBe(true);
    expect(presetSupportsVersion(ultra, "1.12.2")).toBe(false);
    expect(presetSupportsVersion(ultra, "not-a-version")).toBe(false);
  });

  it("skips unavailable mods by version", () => {
    expect(isModAvailableForVersion("starlight", "1.20.1", "fabric")).toBe(true);
    expect(isModAvailableForVersion("starlight", "1.21.1", "fabric")).toBe(false);
    expect(isModAvailableForVersion("iris", "1.21.1", "fabric")).toBe(true);
    expect(isModAvailableForVersion("iris", "1.21.1", "forge")).toBe(false);
    expect(isModAvailableForVersion("sodium", "1.21.1", "forge")).toBe(true);
  });

  it("keeps curated mod lists data-driven", () => {
    expect(ultra.mods.some((mod) => mod.slug === "sodium")).toBe(true);
    expect(ultra.mods.some((mod) => mod.slug === "modmenu")).toBe(true);
    expect(ultra.jvmPreset).toBe("g1-performance");
  });
});
