import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Clock,
  Crosshair,
  Eye,
  Gauge,
  Keyboard,
  MemoryStick,
  Monitor,
  RotateCcw,
  Download,
  Save,
  Shield,
  Users,
  ZoomIn,
} from "lucide-react";
import type { HudConfig, HudElementKey } from "../shared/hud";
import { HUD_ELEMENTS, mergeHudConfig } from "../shared/hud";
import { appStore, useAppState } from "../lib/store";
import { errorMessage, loaderLabel, unwrap } from "../lib/format";
import { Button } from "../ui/Button";
import { Range, Switch } from "../ui/Controls";
import { PageHeader } from "../ui/Feedback";
import { EmptyState, Skeleton } from "../ui/Feedback";

const ELEMENT_ICONS: Record<HudElementKey, typeof Gauge> = {
  fps: Gauge,
  cps: Activity,
  ping: Users,
  coordinates: Crosshair,
  keystrokes: Keyboard,
  armor: Shield,
  clock: Clock,
  memory: MemoryStick,
};

const FPS = 238;

export function HudScreen() {
  const { profiles, selectedProfileId } = useAppState();
  const profile = profiles.find(
    (entry) => entry.id === selectedProfileId && entry.edition === "java",
  );
  const javaProfile = profile?.edition === "java" ? profile : undefined;
  const [config, setConfig] = useState<HudConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState<HudElementKey | null>(null);
  const [installing, setInstalling] = useState(false);
  const [creating, setCreating] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const previewRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!javaProfile) {
      setConfig(null);
      return;
    }
    let cancelled = false;
    setConfig(null);
    setDirty(false);
    void window.openclient.hud
      .get(javaProfile.id)
      .then((result) => {
        if (!cancelled && result.ok) setConfig(mergeHudConfig(result.data));
      })
      .catch((error) =>
        appStore.toast("HUD configuration unavailable", "error", errorMessage(error)),
      );
    return () => {
      cancelled = true;
    };
  }, [javaProfile?.id]);

  const update = useCallback((patch: Partial<HudConfig>) => {
    setConfig((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }, []);

  const toggleElement = (key: HudElementKey, enabled: boolean): void => {
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        elements: {
          ...current.elements,
          [key]: { ...current.elements[key], enabled },
        },
      };
    });
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    if (!javaProfile || !config) return;
    setSaving(true);
    try {
      const saved = await unwrap(window.openclient.hud.save(javaProfile.id, config));
      setConfig(saved);
      setDirty(false);
      appStore.toast("HUD saved", "success", "The companion mod reads this file at startup.");
    } catch (error) {
      appStore.toast("Could not save HUD", "error", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const createHudProfile = async (): Promise<void> => {
    setCreating(true);
    try {
      const created = await unwrap(
        window.openclient.profiles.create({
          name: "HUD 1.21.1",
          edition: "java",
          gameVersion: "1.21.1",
          loader: "fabric",
        }),
      );
      await appStore.refreshProfiles();
      await appStore.selectProfile(created.id);
      appStore.toast("HUD profile created", "success", "Install the HUD, then press Play.");
    } catch (error) {
      appStore.toast("Could not create profile", "error", errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const installCompanion = async (): Promise<void> => {
    if (!javaProfile) return;
    setInstalling(true);
    try {
      const result = await unwrap(window.openclient.hud.install(javaProfile.id));
      await appStore.refreshProfiles();
      appStore.toast("HUD mod installed", "success", result.installed.join(" and "));
    } catch (error) {
      appStore.toast("HUD setup failed", "error", errorMessage(error));
    } finally {
      setInstalling(false);
    }
  };

  const reset = (): void => {
    setConfig(mergeHudConfig(null));
    setDirty(true);
  };

  const onPointerDown = (key: HudElementKey, event: React.PointerEvent): void => {
    const container = previewRef.current;
    if (!container || !config) return;
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    const element = config.elements[key];
    dragOffset.current = { x: px - element.x, y: py - element.y };
    setDragging(key);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent): void => {
      const container = previewRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * 100;
      const py = ((event.clientY - rect.top) / rect.height) * 100;
      setConfig((current) => {
        if (!current) return current;
        const nextX = Math.min(96, Math.max(0, px - dragOffset.current.x));
        const nextY = Math.min(94, Math.max(0, py - dragOffset.current.y));
        return {
          ...current,
          elements: {
            ...current.elements,
            [dragging]: { ...current.elements[dragging], x: nextX, y: nextY },
          },
        };
      });
      setDirty(true);
    };
    const up = (): void => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  const elements = useMemo(() => HUD_ELEMENTS, []);

  if (!javaProfile) {
    return (
      <div className="screen">
        <PageHeader
          eyebrow="Companion"
          title="Client HUD"
          subtitle="Configure the in-game overlay from the OpenClient companion mod."
        />
        <EmptyState
          icon={<Monitor size={24} />}
          title="No Java profile selected"
          text="The HUD is configured per Java profile. Create or select one first."
          action={
            <Button variant="primary" onClick={() => appStore.navigate("profiles")}>
              Go to profiles
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <PageHeader
        eyebrow="Companion mod"
        title="Client HUD"
        subtitle={`${javaProfile.name} · ${loaderLabel(javaProfile.loader)} · configure FPS, CPS, ping, coordinates, keystrokes and more.`}
        actions={
          <>
            <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={reset}>
              Reset layout
            </Button>
            <Button
              variant="primary"
              icon={<Save size={15} />}
              loading={saving}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Save HUD
            </Button>
          </>
        }
      />

      {javaProfile.loader !== "fabric" && javaProfile.loader !== "quilt" ? (
        <div className="notice is-warning" style={{ marginBottom: 16 }}>
          <Monitor size={16} />
          <div>
            <div className="notice-title">Fabric or Quilt required</div>
            The companion mod is a Fabric mod and also runs on Quilt. This profile uses{" "}
            {loaderLabel(javaProfile.loader)}. Switch the profile loader or create a Fabric profile
            to use the HUD.
          </div>
          <Button variant="primary" size="sm" loading={creating} onClick={() => void createHudProfile()}>
            Create HUD profile
          </Button>
        </div>
      ) : null}
      {!javaProfile.gameVersion.startsWith("1.21.") ? (
        <div className="notice is-warning" style={{ marginBottom: 16 }}>
          <Monitor size={16} />
          <div>
            <div className="notice-title">Companion build target</div>
            The bundled companion jar targets Minecraft 1.21.1. This profile uses{" "}
            {javaProfile.gameVersion}. Create a 1.21.1 profile or rebuild companion-mod for this
            version before installing the HUD.
          </div>
          <Button variant="primary" size="sm" loading={creating} onClick={() => void createHudProfile()}>
            Create HUD profile
          </Button>
        </div>
      ) : null}

      <div className="hud-layout">
        <div className="hud-preview-wrap">
          <div className="hud-preview" ref={previewRef}>
            <div className="hud-scene" />
            <div className="hud-crosshair" />
            {config ? (
              <>
                <HudElement
                  keyName="fps"
                  config={config}
                  dragging={dragging}
                  onPointerDown={onPointerDown}
                  text={`${FPS} FPS`}
                  sub="4.2 ms"
                />
                <HudElement
                  keyName="cps"
                  config={config}
                  dragging={dragging}
                  onPointerDown={onPointerDown}
                  text="9 | 5 CPS"
                  sub="left | right"
                />
                <HudElement
                  keyName="ping"
                  config={config}
                  dragging={dragging}
                  onPointerDown={onPointerDown}
                  text="23 ms"
                  sub="low latency"
                />
                <HudElement
                  keyName="coordinates"
                  config={config}
                  dragging={dragging}
                  onPointerDown={onPointerDown}
                  text="X 128  Y 71  Z -342"
                  sub="Overworld · facing north"
                />
                <HudElement
                  keyName="clock"
                  config={config}
                  dragging={dragging}
                  onPointerDown={onPointerDown}
                  text={new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  sub="Day 42 · 06:30"
                />
                <HudElement
                  keyName="memory"
                  config={config}
                  dragging={dragging}
                  onPointerDown={onPointerDown}
                  text="1.8 / 4.0 GB"
                  sub="45% heap"
                />
                {config.elements.keystrokes.enabled ? (
                  <div
                    className={`hud-element hud-keystrokes${config.background ? " has-bg" : ""}`}
                    style={{
                      left: `${config.elements.keystrokes.x}%`,
                      top: `${config.elements.keystrokes.y}%`,
                      color: config.accent,
                      transform: `scale(${config.scale})`,
                    }}
                    onPointerDown={(event) => onPointerDown("keystrokes", event)}
                  >
                    <div className="hud-key-row">
                      <span className="hud-key">W</span>
                    </div>
                    <div className="hud-key-row">
                      <span className="hud-key">A</span>
                      <span className="hud-key">S</span>
                      <span className="hud-key">D</span>
                    </div>
                    <div className="hud-key-row">
                      <span className="hud-key wide">SPACE</span>
                    </div>
                    <div className="hud-key-row">
                      <span className="hud-key wide">SHIFT</span>
                      <span className="hud-key sprint">SPRINT</span>
                    </div>
                  </div>
                ) : null}
                {config.elements.armor.enabled ? (
                  <div
                    className={`hud-element hud-armor${config.background ? " has-bg" : ""}`}
                    style={{
                      left: `${config.elements.armor.x}%`,
                      top: `${config.elements.armor.y}%`,
                      transform: `scale(${config.scale})`,
                    }}
                    onPointerDown={(event) => onPointerDown("armor", event)}
                  >
                    <div className="hud-slot"><Shield size={13} /></div>
                    <div className="hud-slot"><Shield size={13} /></div>
                    <div className="hud-slot"><Shield size={13} /></div>
                    <div className="hud-slot"><Shield size={13} /></div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="hud-loading">
                <Skeleton width="60%" height={26} />
                <Skeleton width="40%" height={18} />
              </div>
            )}

            <div className="hud-preview-toolbar">
              <span className="badge badge-accent">
                <Eye size={11} /> Live layout preview
              </span>
              <span className="field-hint">Drag any element to move it</span>
            </div>
          </div>
          <div className="field-hint mt-2">
            Coordinates are percentages of the screen, so the layout survives window resizes.
            The in-game editor uses the same file. Press Right Shift in game to edit, C to zoom,
            V to toggle sprint.
          </div>
        </div>

        <div className="hud-controls">
          {config === null ? (
            <div className="vstack">
              <Skeleton height={80} />
              <Skeleton height={200} />
              <Skeleton height={200} />
            </div>
          ) : (
            <>
              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Overlay</h2>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Enable HUD</div>
                    <div className="setting-hint">The companion mod hides everything when off.</div>
                  </div>
                  <Switch
                    checked={config.enabled}
                    onChange={(value) => update({ enabled: value })}
                    label="Enable HUD"
                  />
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Backdrop</div>
                    <div className="setting-hint">A soft dark panel behind each element.</div>
                  </div>
                  <Switch
                    checked={config.background}
                    onChange={(value) => update({ background: value })}
                    label="HUD backdrop"
                  />
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Scale</div>
                    <div className="setting-hint">Overall HUD size.</div>
                  </div>
                  <div className="setting-control is-wide">
                    <Range
                      value={config.scale}
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      onChange={(value) => update({ scale: value })}
                      label="HUD scale"
                    />
                    <span className="mono" style={{ width: 42, textAlign: "right", fontSize: 11.5 }}>
                      {config.scale.toFixed(2)}x
                    </span>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Accent</div>
                    <div className="setting-hint">Highlights and key text.</div>
                  </div>
                  <input
                    type="color"
                    value={config.accent}
                    onChange={(event) => update({ accent: event.target.value })}
                    className="hud-color-input"
                    aria-label="HUD accent color"
                  />
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Elements</h2>
                  <p className="settings-section-desc">Click a switch to show or hide it in game.</p>
                </div>
                {elements.map((element) => {
                  const Icon = ELEMENT_ICONS[element.key];
                  return (
                    <div className="setting-row" key={element.key}>
                      <div className="setting-info">
                        <div className="setting-name hstack">
                          <Icon size={14} className="text-muted" />
                          {element.label}
                        </div>
                        <div className="setting-hint">{element.description}</div>
                      </div>
                      <Switch
                        checked={config.elements[element.key].enabled}
                        onChange={(value) => toggleElement(element.key, value)}
                        label={`Show ${element.label}`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Quality of life</h2>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Toggle sprint</div>
                    <div className="setting-hint">Press V in game to keep sprinting without holding the key.</div>
                  </div>
                  <Switch
                    checked={config.toggleSprint}
                    onChange={(value) => update({ toggleSprint: value })}
                    label="Toggle sprint"
                  />
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Zoom</div>
                    <div className="setting-hint">Hold C to zoom. Client-side only.</div>
                  </div>
                  <Switch
                    checked={config.zoom}
                    onChange={(value) => update({ zoom: value })}
                    label="Zoom"
                  />
                </div>
                {config.zoom ? (
                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-name">Zoom strength</div>
                      <div className="setting-hint">Higher means a closer view.</div>
                    </div>
                    <div className="setting-control is-wide">
                      <Range
                        value={config.zoomDivisor}
                        min={1.5}
                        max={10}
                        step={0.5}
                        onChange={(value) => update({ zoomDivisor: value })}
                        label="Zoom divisor"
                      />
                      <span className="mono" style={{ width: 34, textAlign: "right", fontSize: 11.5 }}>
                        {config.zoomDivisor.toFixed(1)}x
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="settings-section">
                <div className="settings-section-head">
                  <h2 className="settings-section-title">Companion mod</h2>
                  <p className="settings-section-desc">
                    The overlay is rendered by the OpenClient Mod in companion-mod. It is a normal
                    client-side Fabric mod with no gameplay advantage.
                  </p>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">One-click setup</div>
                    <div className="setting-hint">
                      Installs Fabric API from Modrinth and copies the OpenClient companion jar
                      into this profile. Nothing third-party is bundled with the launcher.
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Download size={14} />}
                    loading={installing}
                    disabled={
                      (javaProfile.loader !== "fabric" && javaProfile.loader !== "quilt") ||
                      !javaProfile.gameVersion.startsWith("1.21.")
                    }
                    onClick={() => void installCompanion()}
                  >
                    Install HUD
                  </Button>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Install location</div>
                    <div className="setting-hint mono">
                      {javaProfile.gameDir}\mods
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Monitor size={14} />}
                    onClick={() =>
                      void window.openclient.content
                        .openFolder(javaProfile.id, "mod")
                        .catch((error) => appStore.toast("Could not open folder", "error", errorMessage(error)))
                    }
                  >
                    Mods folder
                  </Button>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Build it yourself</div>
                    <div className="setting-hint">
                      The mod lives in the public repository under companion-mod. Run gradlew build
                      and place the jar in the mods folder. It targets Fabric 1.21.1 and Java 21;
                      adjust gradle.properties for other versions.
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Gauge size={14} />}
                    onClick={() =>
                      void window.openclient.app.openExternal(
                        "https://github.com/HappyScripterDev/OpenClient",
                      )
                    }
                  >
                    Repository
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {dirty ? (
        <div className="hud-save-bar">
          <span>Layout changed. Save writes config/openclient-hud.json into the profile.</span>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
            Save changes
          </Button>
        </div>
      ) : null}

      <div className="notice mt-4">
        <ZoomIn size={16} />
        <div>
          <div className="notice-title">Allowed client-side features only</div>
          FPS, CPS, ping, coordinates, keystrokes, armor status, toggle sprint and zoom are visual or
          input-quality features. The companion mod contains no combat automation, x-ray or movement
          exploits.
        </div>
      </div>
    </div>
  );
}

function HudElement({
  keyName,
  config,
  dragging,
  onPointerDown,
  text,
  sub,
}: {
  keyName: HudElementKey;
  config: HudConfig;
  dragging: HudElementKey | null;
  onPointerDown: (key: HudElementKey, event: React.PointerEvent) => void;
  text: string;
  sub: string;
}) {
  const element = config.elements[keyName];
  if (!element?.enabled) return null;
  const Icon = ELEMENT_ICONS[keyName];
  return (
    <div
      className={`hud-element hud-stat${config.background ? " has-bg" : ""}${dragging === keyName ? " is-dragging" : ""}`}
      style={{
        left: `${element.x}%`,
        top: `${element.y}%`,
        transform: `scale(${config.scale})`,
      }}
      onPointerDown={(event) => onPointerDown(keyName, event)}
      role="button"
      tabIndex={-1}
      title={`Drag ${keyName}`}
    >
      <Icon size={11} style={{ color: config.accent }} />
      <span className="hud-stat-text">{text}</span>
      <span className="hud-stat-sub">{sub}</span>
    </div>
  );
}
