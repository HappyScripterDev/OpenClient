import { describe, expect, it } from "vitest";
import {
  buildJvmArguments,
  jvmArgsFor,
  memoryArgs,
  parseExtraJvmArgs,
  recommendJvmPreset,
  recommendMemoryMb,
} from "../src/shared/jvm";

describe("JVM presets", () => {
  it("recommends memory with headroom", () => {
    expect(recommendMemoryMb(4096)).toBe(2048);
    expect(recommendMemoryMb(8192)).toBe(3584);
    expect(recommendMemoryMb(16384)).toBe(7680);
    expect(recommendMemoryMb(32768)).toBe(8192);
    expect(recommendMemoryMb(32768) % 512).toBe(0);
  });

  it("selects presets from memory and Java major", () => {
    expect(recommendJvmPreset(6144, 17)).toBe("low-latency");
    expect(recommendJvmPreset(12288, 17)).toBe("g1-balanced");
    expect(recommendJvmPreset(16384, 21)).toBe("g1-performance");
    expect(recommendJvmPreset(16384, 21, true)).toBe("g1-performance");
    expect(recommendJvmPreset(32768, 21, true)).toBe("zgc");
    expect(recommendJvmPreset(32768, 17, true)).toBe("g1-performance");
  });

  it("removes generational ZGC flag on old Java", () => {
    expect(jvmArgsFor("zgc", 21)).toContain("-XX:+ZGenerational");
    expect(jvmArgsFor("zgc", 17)).not.toContain("-XX:+ZGenerational");
  });

  it("builds memory and preset arguments", () => {
    expect(memoryArgs(4096)).toEqual(["-Xms4096M", "-Xmx4096M"]);
    const args = buildJvmArguments("g1-balanced", 21, 4096, []);
    expect(args[0]).toBe("-Xms4096M");
    expect(args[1]).toBe("-Xmx4096M");
    expect(args).toContain("-XX:+UseG1GC");
  });

  it("uses custom arguments without a preset", () => {
    const args = buildJvmArguments("custom", 21, 3072, ["-XX:+UseG1GC", "-Dtest=1"]);
    expect(args).toEqual(["-Xms3072M", "-Xmx3072M", "-XX:+UseG1GC", "-Dtest=1"]);
  });

  it("parses quoted custom arguments", () => {
    expect(parseExtraJvmArgs('-Dfoo="hello world" -Xmx2G')).toEqual([
      "-Dfoo=hello world",
      "-Xmx2G",
    ]);
  });
});
