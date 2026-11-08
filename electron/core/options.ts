export interface OptionsDocument {
  values: Map<string, string>;
  order: string[];
  lines: string[];
}

export function parseOptionsText(text: string): OptionsDocument {
  const values = new Map<string, string>();
  const order: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!values.has(key)) order.push(key);
    values.set(key, value);
  }
  return { values, order, lines };
}

export function serializeOptions(document: OptionsDocument): string {
  const output: string[] = [];
  const written = new Set<string>();
  for (const line of document.lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      output.push(line);
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) {
      output.push(line);
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (document.values.has(key)) {
      output.push(`${key}:${document.values.get(key)}`);
      written.add(key);
    } else {
      output.push(line);
    }
  }
  for (const key of document.order) {
    if (!written.has(key) && document.values.has(key)) {
      output.push(`${key}:${document.values.get(key)}`);
      written.add(key);
    }
  }
  return output.join("\n").replace(/\n+$/g, "") + "\n";
}

export function patchOptionsText(
  original: string,
  patch: Record<string, string | number | boolean>,
): string {
  const document = parseOptionsText(original);
  for (const [key, value] of Object.entries(patch)) {
    const normalized =
      typeof value === "boolean" ? (value ? "true" : "false") : String(value);
    if (!document.order.includes(key)) document.order.push(key);
    document.values.set(key, normalized);
  }
  return serializeOptions(document);
}

export function readOptionsMap(text: string): Record<string, string> {
  const document = parseOptionsText(text);
  return Object.fromEntries(document.values.entries());
}

export function boolOption(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true";
}

export function optionsPatchForPreset(
  options: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const patch: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(options)) {
    if (key === "enableVsync") continue;
    patch[key] = value;
  }
  if (typeof options.vsync === "boolean") {
    patch.enableVsync = options.vsync;
    delete patch.vsync;
  }
  return patch;
}
