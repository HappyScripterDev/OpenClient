import type { PerformancePresetDefinition } from "./types";

export const PERFORMANCE_PRESETS: PerformancePresetDefinition[] = [
  {
    id: "ultra",
    name: "Ultra FPS",
    tagline: "Maximum frames",
    description:
      "Cuts visual load to the bone and installs the strongest client-side performance mods. Best for low-end machines and competitive play.",
    jvmPreset: "g1-performance",
    minGameVersion: "1.16.5",
    mods: [
      { slug: "sodium", optional: false, kind: "mod", note: "Modern renderer" },
      { slug: "lithium", optional: false, kind: "mod", note: "Game logic optimizations" },
      { slug: "ferrite-core", optional: false, kind: "mod", note: "Memory usage" },
      { slug: "immediatelyfast", optional: false, kind: "mod", note: "Immediate mode rendering" },
      { slug: "entityculling", optional: false, kind: "mod", note: "Skips hidden entities" },
      { slug: "modernfix", optional: false, kind: "mod", note: "Load time and memory" },
      { slug: "krypton", optional: false, kind: "mod", note: "Networking stack" },
      { slug: "dynamic-fps", optional: false, kind: "mod", note: "Idle frame limiting" },
      { slug: "moreculling", optional: false, kind: "mod", note: "Extra face culling" },
      { slug: "starlight", optional: true, kind: "mod", note: "Light engine, 1.20.4 and older" },
      { slug: "modmenu", optional: false, kind: "mod", note: "Mod configuration" },
    ],
    options: {
      renderDistance: 6,
      simulationDistance: 5,
      entityDistanceScaling: 0.5,
      particles: 0,
      graphicsMode: 0,
      clouds: 0,
      vsync: false,
      maxFps: 260,
      biomeBlendRadius: 1,
      mipmapLevels: 2,
      ao: false,
      entityShadows: false,
      enableVsync: false,
    },
  },
  {
    id: "balanced",
    name: "Balanced",
    tagline: "Smooth and clean",
    description:
      "Keeps the world readable while removing the expensive noise. Good visual quality with a stable frame time.",
    jvmPreset: "g1-balanced",
    minGameVersion: "1.16.5",
    mods: [
      { slug: "sodium", optional: false, kind: "mod", note: "Modern renderer" },
      { slug: "lithium", optional: false, kind: "mod", note: "Game logic optimizations" },
      { slug: "ferrite-core", optional: false, kind: "mod", note: "Memory usage" },
      { slug: "immediatelyfast", optional: false, kind: "mod", note: "Immediate mode rendering" },
      { slug: "entityculling", optional: false, kind: "mod", note: "Skips hidden entities" },
      { slug: "modernfix", optional: false, kind: "mod", note: "Load time and memory" },
      { slug: "modmenu", optional: false, kind: "mod", note: "Mod configuration" },
      { slug: "iris", optional: true, kind: "mod", note: "Shader support" },
    ],
    options: {
      renderDistance: 10,
      simulationDistance: 8,
      entityDistanceScaling: 0.75,
      particles: 1,
      graphicsMode: 1,
      clouds: 1,
      vsync: true,
      maxFps: 144,
      biomeBlendRadius: 2,
      mipmapLevels: 4,
      ao: true,
      entityShadows: true,
    },
  },
  {
    id: "quality",
    name: "Quality",
    tagline: "Visual first",
    description:
      "Raises render quality and enables shader support where available. Keeps only the optimizations that do not soften the image.",
    jvmPreset: "g1-balanced",
    minGameVersion: "1.18.2",
    mods: [
      { slug: "sodium", optional: false, kind: "mod", note: "Modern renderer" },
      { slug: "iris", optional: false, kind: "mod", note: "Shader support" },
      { slug: "indium", optional: false, kind: "mod", note: "Fabric rendering compatibility" },
      { slug: "continuity", optional: true, kind: "mod", note: "Connected textures" },
      { slug: "entityculling", optional: false, kind: "mod", note: "Skips hidden entities" },
      { slug: "ferrite-core", optional: false, kind: "mod", note: "Memory usage" },
      { slug: "modmenu", optional: false, kind: "mod", note: "Mod configuration" },
    ],
    options: {
      renderDistance: 16,
      simulationDistance: 12,
      entityDistanceScaling: 1.0,
      particles: 2,
      graphicsMode: 2,
      clouds: 2,
      vsync: true,
      maxFps: 144,
      biomeBlendRadius: 5,
      mipmapLevels: 4,
      ao: true,
      entityShadows: true,
    },
  },
];

export function getPerformancePreset(
  id: string,
): PerformancePresetDefinition | undefined {
  return PERFORMANCE_PRESETS.find((preset) => preset.id === id);
}

export class GameVersion {
  readonly parts: number[];

  constructor(readonly raw: string) {
    const match = raw.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) {
      this.parts = [0, 0, 0];
      return;
    }
    this.parts = [
      Number(match[1]),
      Number(match[2]),
      Number(match[3] ?? 0),
    ];
  }

  compare(other: GameVersion): number {
    for (let i = 0; i < 3; i += 1) {
      if (this.parts[i] !== other.parts[i]) {
        return this.parts[i] - other.parts[i];
      }
    }
    return 0;
  }

  atLeast(version: string): boolean {
    return this.compare(new GameVersion(version)) >= 0;
  }

  atMost(version: string): boolean {
    return this.compare(new GameVersion(version)) <= 0;
  }
}

export function presetSupportsVersion(
  preset: PerformancePresetDefinition,
  gameVersion: string,
): boolean {
  const version = new GameVersion(gameVersion);
  if (version.parts.every((part) => part === 0)) return false;
  if (!version.atLeast(preset.minGameVersion)) return false;
  if (preset.maxGameVersion && !version.atMost(preset.maxGameVersion)) {
    return false;
  }
  return true;
}

export function isModAvailableForVersion(
  slug: string,
  gameVersion: string,
  loader: string,
): boolean {
  if (slug === "starlight") return new GameVersion(gameVersion).atMost("1.20.4");
  if (slug === "indium" || slug === "continuity") {
    return new GameVersion(gameVersion).atLeast("1.17");
  }
  if (slug === "iris") return loader === "fabric" || loader === "quilt";
  return true;
}
