import { useCallback, useEffect, useState } from "react";
import {
  Boxes,
  Check,
  FolderOpen,
  Gauge,
  Info,
  Layers3,
  Palette,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type {
  BedrockContentEntry,
  BedrockOptionEntry,
  BedrockStatus,
} from "../shared/types";
import { appStore, useAppState } from "../lib/store";
import {
  errorMessage,
  formatBytes,
  unwrap,
} from "../lib/format";
import { Button, IconButton } from "../ui/Button";
import { Range, Switch } from "../ui/Controls";
import { Badge, SectionHeader } from "../ui/Panel";
import { EmptyState, PageHeader } from "../ui/Feedback";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Skeleton } from "../ui/Feedback";

const TOGGLE_KEYS = new Set([
  "gfx_fancygraphics",
  "gfx_fancyskies",
  "gfx_transparentleaves",
  "gfx_smooth_lighting",
  "gfx_foliage_waving",
  "gfx_vsync",
  "gfx_texture_filtering",
]);

const RANGES: Record<string, { min: number; max: number; step: number }> = {
  gfx_viewdistance: { min: 4, max: 32, step: 1 },
  gfx_particle_distance: { min: 2, max: 16, step: 1 },
  gfx_field_of_view: { min: 30, max: 110, step: 1 },
  gfx_gamma: { min: 0, max: 100, step: 1 },
  gfx_msaa: { min: 0, max: 8, step: 2 },
};

export function BedrockContentScreen() {
  const { bedrockNoticeSeen, settings } = useAppState();
  const [status, setStatus] = useState<BedrockStatus | null>(null);
  const [content, setContent] = useState<BedrockContentEntry[] | null>(null);
  const [options, setOptions] = useState<BedrockOptionEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [presetBusy, setPresetBusy] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BedrockContentEntry | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [launching, setLaunching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextContent, nextOptions] = await Promise.all([
        unwrap(window.openclient.bedrock.status()),
        unwrap(window.openclient.bedrock.content()).catch(() => []),
        unwrap(window.openclient.bedrock.options()).catch(() => []),
      ]);
      setStatus(nextStatus);
      setContent(nextContent);
      setOptions(nextOptions);
    } catch (error) {
      appStore.toast("Bedrock status unavailable", "error", errorMessage(error));
      setContent([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const importContent = async (): Promise<void> => {
    const paths = await unwrap(
      window.openclient.app.pickFiles("Import Bedrock content", [
        { name: "Minecraft Bedrock content", extensions: ["mcpack", "mcaddon", "zip"] },
      ]),
    );
    if (paths.length === 0) return;
    setImporting(true);
    try {
      const imported = await unwrap(window.openclient.bedrock.importContent(paths));
      await load();
      appStore.toast(
        "Content imported",
        "success",
        `${imported.length} pack${imported.length === 1 ? "" : "s"} placed in com.mojang. Restart Bedrock to see them.`,
      );
    } catch (error) {
      appStore.toast("Import failed", "error", errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await unwrap(window.openclient.bedrock.removeContent(removeTarget.id));
      await load();
      appStore.toast("Content removed", "info", removeTarget.name);
      setRemoveTarget(null);
    } catch (error) {
      appStore.toast("Could not remove content", "error", errorMessage(error));
    } finally {
      setRemoveBusy(false);
    }
  };

  const applyPreset = async (preset: "performance" | "balanced" | "quality"): Promise<void> => {
    setPresetBusy(preset);
    try {
      const next = await unwrap(window.openclient.bedrock.applyPreset(preset));
      setOptions(next);
      appStore.toast("Bedrock graphics tuned", "success", `${preset} preset applied. A backup was kept.`);
    } catch (error) {
      appStore.toast("Could not apply preset", "error", errorMessage(error));
    } finally {
      setPresetBusy(null);
    }
  };

  const setOption = async (key: string, value: string): Promise<void> => {
    setOptions((current) =>
      current?.map((entry) => (entry.key === key ? { ...entry, value } : entry)) ?? current,
    );
    try {
      const next = await unwrap(window.openclient.bedrock.setOption(key, value));
      setOptions(next);
    } catch (error) {
      appStore.toast("Setting was not saved", "error", errorMessage(error));
    }
  };

  const restore = async (): Promise<void> => {
    setRestoreBusy(true);
    try {
      const next = await unwrap(window.openclient.bedrock.restoreOptions());
      setOptions(next);
      appStore.toast("Bedrock options restored", "success");
    } catch (error) {
      appStore.toast("No backup available", "warning", errorMessage(error));
    } finally {
      setRestoreBusy(false);
    }
  };

  const launch = async (): Promise<void> => {
    setLaunching(true);
    try {
      await unwrap(window.openclient.bedrock.launch());
      appStore.toast("Bedrock is opening", "success");
    } catch (error) {
      appStore.toast("Could not launch Bedrock", "error", errorMessage(error));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="screen">
      <PageHeader
        eyebrow="Bedrock Edition"
        title="Content"
        subtitle="Manage resource packs, behavior packs, skin packs and worlds without pretending Bedrock has a mod API."
        actions={
          <>
            <Button variant="secondary" icon={<Gauge size={15} />} onClick={() => appStore.navigate("bedrock-worlds")}>
              Worlds
            </Button>
            <Button
              variant="primary"
              icon={<Play size={15} />}
              loading={launching}
              disabled={!status?.installed}
              onClick={() => void launch()}
            >
              Launch Bedrock
            </Button>
          </>
        }
      />

      {!bedrockNoticeSeen ? (
        <div className="notice is-info" style={{ marginBottom: 16 }}>
          <Info size={17} />
          <div className="grow">
            <div className="notice-title">What Bedrock allows</div>
            Bedrock Edition has no official mod API. OpenClient can launch the game, manage
            .mcpack/.mcaddon/.mcworld files in the public com.mojang folder, back up worlds and
            tune options.txt. It cannot inject client code, and it does not include cheats,
            automation or unfair advantages. Direct join is a deep link that adds the server and
            opens the game.
          </div>
          <IconButton label="Dismiss Bedrock explanation" size="sm" onClick={() => appStore.markBedrockNoticeSeen()}>
            <X size={14} />
          </IconButton>
        </div>
      ) : null}

      {status ? (
        <div className="settings-section" style={{ marginBottom: 18 }}>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">
                {status.installed ? "Bedrock detected" : "Bedrock not detected"}
              </div>
              <div className="setting-hint">
                {status.version ? `Version ${status.version} · ` : ""}
                {status.packageFamilyName ?? "Windows Store / Xbox app"}
              </div>
            </div>
            <div className="setting-control">
              <Badge variant={status.installed ? "success" : "danger"}>
                {status.installed ? "Installed" : "Missing"}
              </Badge>
              {status.gameDir ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FolderOpen size={14} />}
                  onClick={() => void window.openclient.app.openPath(status.gameDir ?? "")}
                >
                  com.mojang
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => void load()}>
                Rescan
              </Button>
            </div>
          </div>
          {status.notes.length > 0 ? (
            <div className="setting-row" style={{ alignItems: "flex-start" }}>
              <div className="setting-info">
                <div className="setting-name">Platform notes</div>
                <ul className="field-hint" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                  {status.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : loading ? (
        <Skeleton height={100} />
      ) : null}

      <div className="two-col">
        <div>
          <SectionHeader
            title="Installed content"
            description={`${content?.length ?? 0} packs in resource_packs, behavior_packs and skin_packs.`}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FolderOpen size={14} />}
                  disabled={!status?.gameDir}
                  onClick={() => void window.openclient.app.openPath(status?.gameDir ?? "")}
                >
                  Folder
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Upload size={14} />}
                  loading={importing}
                  disabled={!status?.supported}
                  onClick={() => void importContent()}
                >
                  Import
                </Button>
              </>
            }
          />
          {content === null ? (
            <div className="vstack">
              <Skeleton height={62} />
              <Skeleton height={62} />
              <Skeleton height={62} />
            </div>
          ) : content.length === 0 ? (
            <EmptyState
              icon={<Layers3 size={22} />}
              title="No content packs"
              text="Import .mcpack or .mcaddon files. OpenClient unpacks them into the correct com.mojang category and never modifies the game executable."
              action={
                <Button variant="primary" icon={<Upload size={15} />} loading={importing} onClick={() => void importContent()}>
                  Import content
                </Button>
              }
            />
          ) : (
            <div className="vstack" style={{ gap: 6 }}>
              {content.map((entry) => (
                <div className="list-row" key={entry.id}>
                  {entry.iconDataUrl ? (
                    <img className="row-art" src={entry.iconDataUrl} alt="" />
                  ) : (
                    <div className="row-art" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Boxes size={16} />
                    </div>
                  )}
                  <div className="row-main">
                    <div className="row-title">{entry.name}</div>
                    <div className="row-sub">
                      <Badge variant="muted">{entry.kind}</Badge>
                      {entry.version ? <span>{entry.version}</span> : null}
                      <span>{formatBytes(entry.sizeBytes)}</span>
                      {entry.packed ? <span>packed file</span> : null}
                    </div>
                  </div>
                  <div className="row-actions">
                    <Badge variant="success">Installed</Badge>
                    <IconButton label={`Remove ${entry.name}`} size="sm" onClick={() => setRemoveTarget(entry)}>
                      <X size={14} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="notice mt-4">
            <Check size={16} />
            <div>
              After importing a pack, open Bedrock and enable it in Settings, Global Resources for
              resource packs, or the world's behavior pack screen. OpenClient cannot toggle those
              in-game selections for you.
            </div>
          </div>
        </div>

        <div>
          <SectionHeader
            title="Graphics options"
            description="options.txt in com.mojang/minecraftpe, with an automatic backup."
            actions={
              <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} loading={restoreBusy} onClick={() => void restore()}>
                Restore
              </Button>
            }
          />
          <div className="panel" style={{ padding: 14 }}>
            <div className="preset-grid" style={{ gridTemplateColumns: "1fr" }}>
              {[
                { id: "performance" as const, name: "Performance", icon: Gauge, desc: "Low view distance, no particles, no MSAA." },
                { id: "balanced" as const, name: "Balanced", icon: Palette, desc: "Default-quality visuals with steady frame time." },
                { id: "quality" as const, name: "Quality", icon: Sparkles, desc: "High view distance and 4x MSAA." },
              ].map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    type="button"
                    className="preset-card"
                    key={preset.id}
                    onClick={() => void applyPreset(preset.id)}
                    disabled={presetBusy !== null}
                  >
                    <div className="hstack">
                      <Icon size={16} />
                      <span className="preset-name">{preset.name}</span>
                      {presetBusy === preset.id ? <span className="spinner" /> : null}
                    </div>
                    <span className="preset-desc">{preset.desc}</span>
                  </button>
                );
              })}
            </div>
            <hr className="divider" />
            {options === null ? (
              <div className="vstack">
                <Skeleton height={30} />
                <Skeleton height={30} />
                <Skeleton height={30} />
              </div>
            ) : options.length === 0 ? (
              <p className="field-hint" style={{ marginTop: 10 }}>
                Launch Bedrock once so it creates its options file, then return here.
              </p>
            ) : (
              <div className="vstack" style={{ gap: 4, marginTop: 6 }}>
                {options.map((entry) => {
                  const isToggle = TOGGLE_KEYS.has(entry.key);
                  const range = RANGES[entry.key] ?? { min: 0, max: 32, step: 1 };
                  const numeric = Number(entry.value) || 0;
                  return (
                    <div key={entry.key} className="setting-row" style={{ padding: "8px 0", borderBottom: "none", gap: 10 }}>
                      <div className="setting-info">
                        <div className="setting-name" style={{ fontSize: 11.5 }}>{entry.label}</div>
                        <div className="setting-hint" style={{ fontSize: 10 }}>{entry.key}</div>
                      </div>
                      <div className="setting-control" style={{ width: isToggle ? "auto" : 130 }}>
                        {isToggle ? (
                          <Switch
                            checked={entry.value === "1"}
                            onChange={(checked) => void setOption(entry.key, checked ? "1" : "0")}
                            label={entry.label}
                          />
                        ) : (
                          <>
                            <Range
                              value={Math.min(range.max, Math.max(range.min, numeric))}
                              min={range.min}
                              max={range.max}
                              step={range.step}
                              onChange={(value) => void setOption(entry.key, String(value))}
                              label={entry.label}
                            />
                            <span className="mono" style={{ width: 30, textAlign: "right", fontSize: 10.5 }}>
                              {entry.value}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="field-hint" style={{ marginTop: 8 }}>
              Bedrock does not expose simulation distance or an FPS cap in options.txt. OpenClient
              does not invent settings the game does not read. Backups live next to options.txt.
            </div>
          </div>
        </div>
      </div>

      {!status?.supported ? (
        <div className="notice is-warning mt-4">
          <Info size={16} />
          <div>
            Bedrock Edition is managed only on Windows. On this platform OpenClient still supports
            Java Edition fully. Bedrock on consoles and mobile has no accessible data folder.
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.name ?? "content"}`}
        description="The pack folder is deleted from com.mojang. Back up anything you want to keep first."
        confirmLabel="Remove content"
        danger
        busy={removeBusy}
        onConfirm={() => void remove()}
        onClose={() => setRemoveTarget(null)}
      />

      <div className="hstack mt-4">
        <Button variant="ghost" size="sm" onClick={() => appStore.navigate("settings")}>
          Bedrock folder settings
        </Button>
        <span className="field-hint">
          {settings.bedrockGameDir
            ? "Using the folder from Settings."
            : "Using automatic detection."}
        </span>
      </div>
    </div>
  );
}
