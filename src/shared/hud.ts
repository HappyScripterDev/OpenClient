export type HudElementKey =
  | "fps"
  | "cps"
  | "ping"
  | "coordinates"
  | "keystrokes"
  | "armor"
  | "clock"
  | "memory";

export interface HudElementConfig {
  enabled: boolean;
  x: number;
  y: number;
}

export interface HudConfig {
  version: number;
  enabled: boolean;
  background: boolean;
  scale: number;
  accent: string;
  toggleSprint: boolean;
  zoom: boolean;
  zoomDivisor: number;
  elements: Record<HudElementKey, HudElementConfig>;
}

export const HUD_ELEMENTS: { key: HudElementKey; label: string; description: string }[] = [
  { key: "fps", label: "FPS", description: "Current frame rate and frame time." },
  { key: "cps", label: "CPS", description: "Left and right clicks per second." },
  { key: "ping", label: "Ping", description: "Latency to the current server." },
  { key: "coordinates", label: "Coordinates", description: "X, Y, Z, dimension and facing." },
  { key: "keystrokes", label: "Keystrokes", description: "WASD, jump, sneak and sprint keys." },
  { key: "armor", label: "Armor & held item", description: "Durability of armor and both hands." },
  { key: "clock", label: "Clock", description: "Real time and in-game day time." },
  { key: "memory", label: "Memory", description: "Used and allocated Java heap." },
];

const DEFAULT_ELEMENTS: Record<HudElementKey, HudElementConfig> = {
  fps: { enabled: true, x: 1.5, y: 1.5 },
  cps: { enabled: true, x: 1.5, y: 7 },
  ping: { enabled: true, x: 1.5, y: 12.5 },
  coordinates: { enabled: true, x: 1.5, y: 18 },
  keystrokes: { enabled: true, x: 1.5, y: 68 },
  armor: { enabled: true, x: 84, y: 78 },
  clock: { enabled: false, x: 84, y: 1.5 },
  memory: { enabled: false, x: 84, y: 7 },
};

export const DEFAULT_HUD_CONFIG: HudConfig = {
  version: 1,
  enabled: true,
  background: true,
  scale: 1,
  accent: "#ff4d4d",
  toggleSprint: true,
  zoom: true,
  zoomDivisor: 4,
  elements: DEFAULT_ELEMENTS,
};

export function mergeHudConfig(input: Partial<HudConfig> | null | undefined): HudConfig {
  const base = DEFAULT_HUD_CONFIG;
  if (!input) {
    return {
      ...base,
      elements: { ...base.elements },
    };
  }
  const elements = { ...base.elements };
  for (const key of Object.keys(elements) as HudElementKey[]) {
    const value = input.elements?.[key];
    if (!value) continue;
    elements[key] = {
      enabled: typeof value.enabled === "boolean" ? value.enabled : elements[key].enabled,
      x: clamp(Number(value.x), 0, 100),
      y: clamp(Number(value.y), 0, 100),
    };
  }
  return {
    version: 1,
    enabled: input.enabled ?? base.enabled,
    background: input.background ?? base.background,
    scale: clamp(Number(input.scale ?? base.scale), 0.5, 2.5),
    accent: /^#[0-9a-f]{6}$/i.test(input.accent ?? "") ? (input.accent as string) : base.accent,
    toggleSprint: input.toggleSprint ?? base.toggleSprint,
    zoom: input.zoom ?? base.zoom,
    zoomDivisor: clamp(Number(input.zoomDivisor ?? base.zoomDivisor), 1.5, 10),
    elements,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
