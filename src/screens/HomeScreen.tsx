import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  Coffee,
  Cpu,
  ExternalLink,
  Gauge,
  Home,
  Play,
  RefreshCw,
  Server,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import logo from "../../assets/OcTransparent.png";
import type {
  BedrockContentEntry,
  BedrockStatus,
  BedrockWorldEntry,
  NewsItem,
  ServerEntry,
  ServiceStatusEntry,
} from "../shared/types";
import { appStore, useAppState } from "../lib/store";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { StatusDot } from "../ui/Panel";
import { Skeleton } from "../ui/Feedback";
import {
  errorMessage,
  formatUptime,
  loaderLabel,
  performanceLabel,
  requiredJavaMajor,
  unwrap,
} from "../lib/format";

const COVER_BACKGROUNDS: Record<string, string> = {
  play: "linear-gradient(145deg, #2b1d54 0%, #1b1330 55%, #0c0915 100%)",
  performance: "linear-gradient(145deg, #123944 0%, #0b1e27 60%, #080c12 100%)",
  hud: "linear-gradient(145deg, #4a1d2c 0%, #23101a 60%, #0c080b 100%)",
  bedrock: "linear-gradient(145deg, #1b2f5e 0%, #121b36 60%, #090b12 100%)",
};

export function HomeScreen() {
  const state = useAppState();
  const { profiles, selectedProfileId, edition, accounts, gameState } = state;
  const profile = profiles.find((entry) => entry.id === selectedProfileId);
  const editionProfiles = profiles.filter((entry) => entry.edition === edition);
  const activeAccount = accounts.find((account) => account.active);
  const running = gameState.running && gameState.profileId === profile?.id;
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [statuses, setStatuses] = useState<ServiceStatusEntry[] | null>(null);
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [systemMemory, setSystemMemory] = useState<number | null>(null);
  const [bedrockStatus, setBedrockStatus] = useState<BedrockStatus | null>(null);
  const [bedrockContent, setBedrockContent] = useState<BedrockContentEntry[]>([]);
  const [bedrockWorlds, setBedrockWorlds] = useState<BedrockWorldEntry[]>([]);
  const [uptime, setUptime] = useState("");

  const load = useCallback(async () => {
    const [newsResult, statusResult, memoryResult, serverResult] = await Promise.all([
      window.openclient.news.news().catch(() => null),
      window.openclient.news.statuses().catch(() => null),
      window.openclient.app.systemMemory().catch(() => null),
      window.openclient.servers.list().catch(() => null),
    ]);
    setNews(newsResult?.ok ? newsResult.data : []);
    setStatuses(statusResult?.ok ? statusResult.data : []);
    setSystemMemory(memoryResult?.ok ? memoryResult.data.totalMb : null);
    setServers(serverResult?.ok ? serverResult.data : []);
  }, []);

  const loadBedrock = useCallback(async () => {
    try {
      const [status, content, worlds] = await Promise.all([
        unwrap(window.openclient.bedrock.status()),
        unwrap(window.openclient.bedrock.content()).catch(() => []),
        unwrap(window.openclient.bedrock.worlds()).catch(() => []),
      ]);
      setBedrockStatus(status);
      setBedrockContent(content);
      setBedrockWorlds(worlds);
    } catch (error) {
      appStore.toast("Bedrock status unavailable", "error", errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (edition === "bedrock") void loadBedrock();
  }, [edition, loadBedrock]);

  useEffect(() => {
    if (!running || !gameState.startedAt) return;
    const update = (): void =>
      setUptime(formatUptime(Date.now() - (gameState.startedAt ?? Date.now())));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [running, gameState.startedAt]);

  const recent = useMemo(() => {
    const profileRows = [...editionProfiles]
      .sort((a, b) => (b.lastPlayed ?? b.updatedAt) - (a.lastPlayed ?? a.updatedAt))
      .map((entry) => ({
        id: `profile:${entry.id}`,
        title: entry.name,
        sub:
          entry.edition === "java"
            ? `Profile · ${entry.gameVersion} · ${loaderLabel(entry.loader)}`
            : "Profile · Bedrock Edition",
        art: "P",
        meta: entry.lastPlayed ? "Recently" : "Ready",
        action: () => void appStore.launchProfile(entry.id),
      }));
    const serverRows = servers.slice(0, 3).map((server) => ({
      id: `server:${server.id}`,
      title: server.name,
      sub: `${server.address}:${server.port}`,
      art: "S",
      meta: server.crossPlay === "both" ? "Cross-play" : server.crossPlay,
      action: () => appStore.navigate("servers"),
    }));
    return [...profileRows, ...serverRows].slice(0, 6);
  }, [editionProfiles, servers]);

  const onlineServices = statuses?.filter((entry) => entry.state === "up").length ?? 0;
  const totalServices = statuses?.length ?? 0;

  const playCardSub =
    profile?.edition === "java"
      ? `${profile.gameVersion} · ${loaderLabel(profile.loader)}${profile.loaderVersion ? ` ${profile.loaderVersion}` : ""}`
      : profile
        ? "Bedrock Edition"
        : "Create a profile to start";

  return (
    <div className="screen">
      <div className="liner-heading-row">
        <div className="liner-heading">
          <span className="section-orb">
            <Home size={19} />
          </span>
          <h1>
            {running ? "In game" : "Ready to play"}
            <span> / {edition === "java" ? "Java" : "Bedrock"}</span>
          </h1>
        </div>
        <div className="page-actions">
          <div style={{ width: 190 }}>
            <Select
              value={profile?.id ?? ""}
              onChange={(value) => void appStore.selectProfile(value)}
              options={editionProfiles.map((entry) => ({
                value: entry.id,
                label: entry.name,
                description:
                  entry.edition === "java"
                    ? `${entry.gameVersion} · ${loaderLabel(entry.loader)}`
                    : "Bedrock Edition",
              }))}
              placeholder={editionProfiles.length === 0 ? "No profiles" : "Select profile"}
              disabled={editionProfiles.length === 0}
              ariaLabel="Active profile"
            />
          </div>
          <Button variant="secondary" icon={<ArrowUpRight size={15} />} onClick={() => appStore.navigate("profiles")}>
            Profiles
          </Button>
        </div>
      </div>

      <div className="stat-pills">
        {edition === "java" ? (
          <>
            <div className="stat-pill">
              <Gauge size={14} />
              FPS profile <strong>{performanceLabel(profile?.edition === "java" ? profile.performancePreset : undefined)}</strong>
            </div>
            <div className="stat-pill">
              <Cpu size={14} />
              Memory <strong>{profile?.edition === "java" ? `${profile.memoryMb} MB` : "—"}</strong>
            </div>
            <div className="stat-pill">
              <Coffee size={14} />
              Java <strong>{profile?.edition === "java" ? `Java ${requiredJavaMajor(profile.gameVersion)}` : "—"}</strong>
            </div>
            <div className="stat-pill">
              <Zap size={14} />
              Mods <strong>{profile?.edition === "java" ? profile.mods.length : 0}</strong>
            </div>
            {systemMemory ? (
              <div className="stat-pill">
                <Cpu size={14} />
                System <strong>{(systemMemory / 1024).toFixed(0)} GB</strong>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="stat-pill">
              <Boxes size={14} />
              Bedrock <strong>{bedrockStatus?.installed ? bedrockStatus.version ?? "Installed" : "Not detected"}</strong>
            </div>
            <div className="stat-pill">
              <Sparkles size={14} />
              Content packs <strong>{bedrockContent.length}</strong>
            </div>
            <div className="stat-pill">
              <Gauge size={14} />
              Worlds <strong>{bedrockWorlds.length}</strong>
            </div>
          </>
        )}
      </div>

      <div className="mix-grid">
        <button
          type="button"
          className="mix-card"
          onClick={() => (running ? void appStore.stopGame() : void appStore.launchProfile(profile?.id))}
          disabled={!profile}
        >
          <div className="mix-cover" style={{ "--mix-bg": COVER_BACKGROUNDS.play } as React.CSSProperties}>
            <img className="mix-watermark" src={logo} alt="" />
            <span className="mix-badge">{running ? `Running ${uptime}` : edition === "java" ? "Java Edition" : "Bedrock Edition"}</span>
            <h3>{running ? "STOP" : "PLAY"}</h3>
            <p>{profile?.name ?? "No profile"}</p>
            <span className="mix-play">
              {running ? <Square size={17} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </span>
          </div>
          <span className="mix-title">{running ? "Stop Minecraft" : "Launch Minecraft"}</span>
          <span className="mix-sub">{playCardSub}</span>
        </button>

        {edition === "java" ? (
          <>
            <button type="button" className="mix-card" onClick={() => appStore.navigate("mods")}>
              <div className="mix-cover" style={{ "--mix-bg": COVER_BACKGROUNDS.performance } as React.CSSProperties}>
                <img className="mix-watermark" src={logo} alt="" />
                <span className="mix-badge">{performanceLabel(profile?.edition === "java" ? profile.performancePreset : undefined)}</span>
                <h3>ULTRA{"\n"}FPS</h3>
                <p>{profile?.edition === "java" ? `${profile.mods.length} mods installed` : "Performance profiles"}</p>
              </div>
              <span className="mix-title">Performance</span>
              <span className="mix-sub">Sodium, Lithium, JVM tuning</span>
            </button>
            <button type="button" className="mix-card" onClick={() => appStore.navigate("hud")}>
              <div className="mix-cover" style={{ "--mix-bg": COVER_BACKGROUNDS.hud } as React.CSSProperties}>
                <img className="mix-watermark" src={logo} alt="" />
                <span className="mix-badge">FPS · CPS · PING</span>
                <h3>CLIENT{"\n"}HUD</h3>
                <p>Drag, toggle and save in game</p>
              </div>
              <span className="mix-title">Client HUD</span>
              <span className="mix-sub">Companion mod overlay</span>
            </button>
          </>
        ) : (
          <>
            <button type="button" className="mix-card" onClick={() => appStore.navigate("bedrock-content")}>
              <div className="mix-cover" style={{ "--mix-bg": COVER_BACKGROUNDS.performance } as React.CSSProperties}>
                <img className="mix-watermark" src={logo} alt="" />
                <span className="mix-badge">{bedrockContent.length} packs</span>
                <h3>PACKS{"\n"}&amp; SKINS</h3>
                <p>Resource, behavior and skin packs</p>
              </div>
              <span className="mix-title">Bedrock content</span>
              <span className="mix-sub">Import and manage packs</span>
            </button>
            <button type="button" className="mix-card" onClick={() => appStore.navigate("bedrock-worlds")}>
              <div className="mix-cover" style={{ "--mix-bg": COVER_BACKGROUNDS.hud } as React.CSSProperties}>
                <img className="mix-watermark" src={logo} alt="" />
                <span className="mix-badge">{bedrockWorlds.length} worlds</span>
                <h3>WORLD{"\n"}BACKUPS</h3>
                <p>Backup, restore and export</p>
              </div>
              <span className="mix-title">Bedrock worlds</span>
              <span className="mix-sub">Safe copies in one click</span>
            </button>
          </>
        )}

        <button type="button" className="mix-card" onClick={() => appStore.navigate("servers")}>
          <div className="mix-cover" style={{ "--mix-bg": COVER_BACKGROUNDS.bedrock } as React.CSSProperties}>
            <img className="mix-watermark" src={logo} alt="" />
            <span className="mix-badge">{servers.length} saved</span>
            <h3>SERVERS</h3>
            <p>Cross-play aware pings</p>
          </div>
          <span className="mix-title">Servers</span>
          <span className="mix-sub">Java and Bedrock pings</span>
        </button>
      </div>

      <section className="liner-section">
        <div className="liner-section-head">
          <span className="section-orb">
            <Play size={14} fill="currentColor" />
          </span>
          <h2>Recently played</h2>
          <div className="page-actions">
            <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="liner-panel">
          {recent.length === 0 ? (
            <div className="empty" style={{ padding: 28 }}>
              <div className="empty-title">Nothing here yet</div>
              <p className="empty-text">Create a profile to fill this space.</p>
            </div>
          ) : (
            <div className="liner-list">
              {recent.map((item) => (
                <button type="button" className="liner-row" key={item.id} onClick={item.action}>
                  <span className="liner-art">{item.art}</span>
                  <span className="liner-row-main">
                    <span className="liner-row-title">{item.title}</span>
                    <span className="liner-row-sub">{item.sub}</span>
                  </span>
                  <span className="liner-row-meta">{item.meta}</span>
                  <span className="liner-row-icon">
                    <Play size={13} fill="currentColor" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="home-bottom">
        <section className="liner-section">
          <div className="liner-section-head">
            <span className="section-orb">
              <ExternalLink size={13} />
            </span>
            <h2>Minecraft news</h2>
          </div>
          <div className="liner-panel">
            {news === null ? (
              <div className="vstack" style={{ padding: 10 }}>
                <Skeleton height={44} />
                <Skeleton height={44} />
              </div>
            ) : news.length === 0 ? (
              <div className="empty" style={{ padding: 24 }}>
                <div className="empty-title">News is unavailable offline</div>
                <p className="empty-text">Cached manifests and installed files still work.</p>
              </div>
            ) : (
              <div className="vstack" style={{ gap: 2 }}>
                {news.slice(0, 4).map((item) => (
                  <button
                    type="button"
                    className="liner-row"
                    key={item.id}
                    onClick={() => void window.openclient.app.openExternal(item.url)}
                  >
                    {item.imageUrl ? (
                      <img className="liner-art" src={item.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="liner-art">
                        <ExternalLink size={15} />
                      </span>
                    )}
                    <span className="liner-row-main">
                      <span className="liner-row-title">{item.title}</span>
                      <span className="liner-row-sub">{item.summary}</span>
                    </span>
                    <span className="liner-row-icon">
                      <ArrowUpRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="liner-section">
          <div className="liner-section-head">
            <span className="section-orb">
              <Server size={13} />
            </span>
            <h2>Status</h2>
          </div>
          <div className="liner-panel" style={{ padding: 12 }}>
            <div className="status-summary" style={{ marginBottom: 8 }}>
              <StatusDot state={onlineServices === totalServices && totalServices > 0 ? "online" : "degraded"} pulse />
              Mojang services {onlineServices}/{totalServices} up
            </div>
            <div className="vstack" style={{ gap: 1 }}>
              {(statuses ?? []).slice(0, 6).map((entry) => (
                <div className="spread" key={entry.id} style={{ padding: "6px 4px" }}>
                  <span className="hstack" style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                    <StatusDot
                      state={
                        entry.state === "up"
                          ? "online"
                          : entry.state === "degraded"
                            ? "degraded"
                            : entry.state === "down"
                              ? "offline"
                              : "unknown"
                      }
                    />
                    {entry.name}
                  </span>
                  <span className="field-hint">{entry.detail}</span>
                </div>
              ))}
              {!statuses || statuses.length === 0 ? (
                <span className="field-hint" style={{ padding: 4 }}>
                  Status could not be loaded.
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {!activeAccount ? (
        <div className="notice is-warning mt-4">
          <Home size={16} />
          <div>Sign in to unlock the launcher workspace.</div>
        </div>
      ) : null}
    </div>
  );
}
