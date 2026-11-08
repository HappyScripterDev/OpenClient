import type { JvmPresetId } from "./types";

export interface JvmPreset {
  id: JvmPresetId;
  name: string;
  description: string;
  args: string[];
  recommendedFor: string;
}

const AIKAR_BASE = [
  "-XX:+UseG1GC",
  "-XX:+ParallelRefProcEnabled",
  "-XX:MaxGCPauseMillis=200",
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+DisableExplicitGC",
  "-XX:+AlwaysPreTouch",
  "-XX:G1NewSizePercent=30",
  "-XX:G1MaxNewSizePercent=40",
  "-XX:G1HeapRegionSize=8M",
  "-XX:G1ReservePercent=20",
  "-XX:G1HeapWastePercent=5",
  "-XX:G1MixedGCCountTarget=4",
  "-XX:InitiatingHeapOccupancyPercent=15",
  "-XX:G1MixedGCLiveThresholdPercent=90",
  "-XX:G1RSetUpdatingPauseTimePercent=5",
  "-XX:SurvivorRatio=32",
  "-XX:+PerfDisableSharedMem",
  "-XX:MaxTenuringThreshold=1",
  "-Dusing.aikars.flags=https://mcflags.emc.gs",
  "-Daikars.new.flags=true",
];

export const JVM_PRESETS: JvmPreset[] = [
  {
    id: "g1-balanced",
    name: "G1 Balanced",
    description:
      "Tuned G1 garbage collector with short pauses. The safest choice for most systems.",
    args: [...AIKAR_BASE],
    recommendedFor: "8-16 GB systems",
  },
  {
    id: "g1-performance",
    name: "G1 Performance",
    description:
      "Aikar-style G1 flags with larger regions for high-heap systems and heavy modpacks.",
    args: [
      ...AIKAR_BASE,
      "-XX:G1NewSizePercent=40",
      "-XX:G1MaxNewSizePercent=50",
      "-XX:G1HeapRegionSize=16M",
      "-XX:G1ReservePercent=15",
      "-XX:InitiatingHeapOccupancyPercent=20",
    ],
    recommendedFor: "16 GB and above",
  },
  {
    id: "zgc",
    name: "ZGC Low Pause",
    description:
      "Generational ZGC with sub-millisecond pauses. Requires Java 21 or newer.",
    args: [
      "-XX:+UseZGC",
      "-XX:+ZGenerational",
      "-XX:+AlwaysPreTouch",
      "-XX:+DisableExplicitGC",
      "-XX:+PerfDisableSharedMem",
    ],
    recommendedFor: "Java 21+, 24 GB and above",
  },
  {
    id: "low-latency",
    name: "Low Latency",
    description:
      "G1 with a reduced heap target for smaller machines and competitive play.",
    args: [
      "-XX:+UseG1GC",
      "-XX:+ParallelRefProcEnabled",
      "-XX:MaxGCPauseMillis=100",
      "-XX:+UnlockExperimentalVMOptions",
      "-XX:+DisableExplicitGC",
      "-XX:G1NewSizePercent=20",
      "-XX:G1MaxNewSizePercent=30",
      "-XX:G1HeapRegionSize=4M",
      "-XX:G1ReservePercent=20",
      "-XX:InitiatingHeapOccupancyPercent=15",
      "-XX:MaxTenuringThreshold=1",
    ],
    recommendedFor: "4-8 GB systems",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Only the arguments you provide are passed to the JVM.",
    args: [],
    recommendedFor: "Advanced users",
  },
];

export function getJvmPreset(id: JvmPresetId): JvmPreset {
  return JVM_PRESETS.find((preset) => preset.id === id) ?? JVM_PRESETS[0];
}

export function jvmArgsFor(id: JvmPresetId, javaMajor: number): string[] {
  const preset = getJvmPreset(id);
  if (preset.id !== "zgc") return [...preset.args];
  if (javaMajor < 21) {
    return preset.args.filter((arg) => arg !== "-XX:+ZGenerational");
  }
  return [...preset.args];
}

export function estimateSystemMemoryMb(totalBytes: number): number {
  return Math.floor(totalBytes / (1024 * 1024));
}

export function recommendMemoryMb(totalMemoryMb: number): number {
  if (totalMemoryMb < 6144) return 2048;
  const usable = totalMemoryMb - 2048;
  const target = Math.min(8192, Math.max(2048, Math.floor(usable * 0.55)));
  return Math.round(target / 512) * 512;
}

export function recommendJvmPreset(
  totalMemoryMb: number,
  javaMajor: number,
  heavyModpack = false,
): JvmPresetId {
  if (javaMajor >= 21 && totalMemoryMb >= 24576 && heavyModpack) return "zgc";
  if (totalMemoryMb >= 16384 || heavyModpack) return "g1-performance";
  if (totalMemoryMb < 8192) return "low-latency";
  return "g1-balanced";
}

export function memoryArgs(memoryMb: number): string[] {
  const safe = Math.max(1024, Math.min(32768, Math.round(memoryMb)));
  return [`-Xms${safe}M`, `-Xmx${safe}M`];
}

export function buildJvmArguments(
  preset: JvmPresetId,
  javaMajor: number,
  memoryMb: number,
  customArgs: string[],
  extra: string[] = [],
): string[] {
  const base =
    preset === "custom" ? [...customArgs] : [...jvmArgsFor(preset, javaMajor)];
  return [...memoryArgs(memoryMb), ...base, ...extra];
}

export function parseExtraJvmArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const character of input) {
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (current) args.push(current);
  return args;
}