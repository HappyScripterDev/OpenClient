import {
  Boxes,
  Coffee,
  Cpu,
  FolderOpen,
  Gauge,
  Monitor,
  Package,
  Play,
  Puzzle,
  Server,
  Settings2,
  Square,
} from "lucide-react";
import logo from "../../assets/OcTransparent.png";
import { appStore, useAppState } from "../lib/store";
import { useTransfer } from "../lib/transferStore";
import { formatBytes, loaderLabel, performanceLabel } from "../lib/format";
import { IconButton } from "./Button";

export function ProfileBar() {
  const state = useAppState();
  const progress = useTransfer();
  const { profiles, selectedProfileId, edition, gameState } = state;
  const profile = profiles.find((entry) => entry.id === selectedProfileId);
  const running = gameState.running && gameState.profileId === profile?.id;

  const percent = progress
    ? progress.bytesTotal > 0
      ? Math.min(100, Math.round((progress.bytesReceived / progress.bytesTotal) * 100))
      : progress.filesTotal > 0
        ? Math.round((progress.filesDone / progress.filesTotal) * 100)
        : 100
    : 0;

  const subtitle = progress
    ? `${progress.label} · ${
        progress.done
          ? "done"
          : progress.bytesTotal > 0
            ? `${formatBytes(progress.bytesReceived)} / ${formatBytes(progress.bytesTotal)}`
            : `${progress.filesDone} / ${progress.filesTotal}`
      }`
    : profile
      ? profile.edition === "java"
        ? `${profile.gameVersion} · ${loaderLabel(profile.loader)}${profile.loaderVersion ? ` ${profile.loaderVersion}` : ""}`
        : "Bedrock Edition"
      : "No profile selected";

  const middle = edition === "java" ? "mods" : "bedrock-content";
  const middleTwo = edition === "java" ? "hud" : "bedrock-worlds";

  return (
    <div className="profile-bar" role="contentinfo">
      {progress ? (
        <div
          className="profile-bar-progress"
          style={{ width: `${percent}%` }}
          aria-hidden
        />
      ) : null}
      <button
        type="button"
        className="profile-bar-track"
        onClick={() => appStore.navigate("profiles")}
        title="Open profiles"
      >
        <span className="profile-bar-cover">
          <img src={logo} alt="" />
        </span>
        <span className="profile-bar-meta">
          <span className="profile-bar-title">{profile?.name ?? "No profile"}</span>
          <span className="profile-bar-sub">{subtitle}</span>
        </span>
      </button>

      <div className="profile-bar-center">
        <IconButton
          label={middle === "mods" ? "Mods" : "Content"}
          size="sm"
          onClick={() => appStore.navigate(middle)}
        >
          {middle === "mods" ? <Puzzle size={17} /> : <Boxes size={17} />}
        </IconButton>
        <button
          type="button"
          className={`profile-bar-play${running ? " is-running" : ""}`}
          onClick={() => {
            if (running) void appStore.stopGame();
            else void appStore.launchProfile(profile?.id);
          }}
          disabled={!profile}
          aria-label={running ? "Stop Minecraft" : "Play Minecraft"}
          title={running ? "Stop Minecraft" : "Play Minecraft"}
        >
          {running ? <Square size={15} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <IconButton
          label={middleTwo === "hud" ? "Client HUD" : "Worlds"}
          size="sm"
          onClick={() => appStore.navigate(middleTwo)}
        >
          {middleTwo === "hud" ? <Monitor size={17} /> : <Package size={17} />}
        </IconButton>
      </div>

      <div className="profile-bar-right">
        {edition === "java" ? (
          <>
            <span className="profile-bar-chip" title="Performance profile">
              <Gauge size={13} />
              {performanceLabel(profile?.edition === "java" ? profile.performancePreset : undefined)}
            </span>
            <span className="profile-bar-chip" title="Allocated memory">
              <Cpu size={13} />
              {profile?.edition === "java" ? `${profile.memoryMb} MB` : "—"}
            </span>
            <span className="profile-bar-chip" title="Java runtime">
              <Coffee size={13} />
              Java
            </span>
          </>
        ) : (
          <span className="profile-bar-chip">
            <Boxes size={13} />
            Bedrock
          </span>
        )}
        <IconButton
          label="Open game folder"
          size="sm"
          onClick={() => {
            if (!profile) return;
            void window.openclient.app.openPath(profile.gameDir);
          }}
        >
          <FolderOpen size={16} />
        </IconButton>
        <IconButton label="Servers" size="sm" onClick={() => appStore.navigate("servers")}>
          <Server size={16} />
        </IconButton>
        <IconButton label="Settings" size="sm" onClick={() => appStore.navigate("settings")}>
          <Settings2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}
