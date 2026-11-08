import { useEffect } from "react";
import logo from "../../assets/OcTransparent.png";
import { appStore, useAppState } from "../lib/store";
import { TitleBar, useEditionNav } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { HomeScreen } from "../screens/HomeScreen";
import { ProfilesScreen } from "../screens/ProfilesScreen";
import { ModsScreen } from "../screens/ModsScreen";
import { PacksScreen } from "../screens/PacksScreen";
import { HudScreen } from "../screens/HudScreen";
import { ServersScreen } from "../screens/ServersScreen";
import { AccountsScreen } from "../screens/AccountsScreen";
import { LogsScreen } from "../screens/LogsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { BedrockContentScreen } from "../screens/BedrockContentScreen";
import { BedrockWorldsScreen } from "../screens/BedrockWorldsScreen";
import { ToastLayer } from "../ui/ToastLayer";
import { EulaDialog } from "../ui/EulaDialog";
import { LaunchOverlay } from "../ui/LaunchOverlay";
import { ActivityBar } from "../ui/ActivityBar";
import { LoginGate } from "../ui/LoginGate";
import { Button } from "../ui/Button";

function CurrentScreen() {
  const { route } = useAppState();
  switch (route) {
    case "home":
      return <HomeScreen />;
    case "profiles":
      return <ProfilesScreen />;
    case "mods":
      return <ModsScreen />;
    case "hud":
      return <HudScreen />;
    case "packs":
      return <PacksScreen />;
    case "servers":
      return <ServersScreen />;
    case "accounts":
      return <AccountsScreen />;
    case "logs":
      return <LogsScreen />;
    case "settings":
      return <SettingsScreen />;
    case "bedrock-content":
      return <BedrockContentScreen />;
    case "bedrock-worlds":
      return <BedrockWorldsScreen />;
    default:
      return <HomeScreen />;
  }
}

export default function App() {
  const state = useAppState();
  const nav = useEditionNav();

  useEffect(() => {
    void appStore.init();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.settings.theme;
    root.style.setProperty("--accent", state.settings.accent);
    root.style.setProperty(
      "--accent-strong",
      state.settings.accent,
    );
    document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
    document.title = "OpenClient";
  }, [state.settings.theme, state.settings.accent, state.settings.reduceMotion]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.ctrlKey || event.metaKey) {
        if (event.key >= "1" && event.key <= "9") {
          const item = nav[Number(event.key) - 1];
          if (item) {
            event.preventDefault();
            appStore.navigate(item.route);
          }
          return;
        }
        if (event.key.toLowerCase() === "k") {
          event.preventDefault();
          appStore.navigate(state.edition === "java" ? "mods" : "bedrock-content");
          window.setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>("[data-global-search]");
            input?.focus();
            input?.select();
          }, 90);
          return;
        }
        if (event.key === ",") {
          event.preventDefault();
          appStore.navigate("settings");
        }
      }
      if (event.key === "Escape" && !typing) {
        if (state.launchOverlay?.active) {
          appStore.dismissLaunchOverlay();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nav, state.edition, state.launchOverlay]);

  if (!state.ready) {
    return (
      <div className="app-window">
        <div className="app-ambient" />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <img src={logo} alt="" style={{ width: 76, height: 76, objectFit: "contain", filter: "drop-shadow(0 16px 40px var(--accent-glow))" }} />
          <div style={{ fontSize: 20, fontWeight: 700 }}>OpenClient</div>
          <div className="field-hint">Preparing launcher services</div>
          <div className="launch-steps" style={{ width: 220 }}>
            <div className="activity-fill is-indeterminate" />
          </div>
        </div>
      </div>
    );
  }

  if (state.initError) {
    return (
      <div className="app-window">
        <div className="app-ambient" />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: 30,
            textAlign: "center",
          }}
        >
          <img src={logo} alt="" style={{ width: 60, height: 60, opacity: 0.8 }} />
          <div style={{ fontSize: 20, fontWeight: 700 }}>OpenClient could not start</div>
          <p className="field-hint" style={{ maxWidth: 520, lineHeight: 1.6 }}>
            {state.initError}
          </p>
          <div className="hstack">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <Button variant="secondary" onClick={() => void window.openclient.app.openPath(state.info?.dataRoot ?? "")}>
              Open data folder
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasAccount = state.accounts.some((account) => account.active);
  if (!hasAccount) {
    return (
      <div
        className={`app-window${state.windowState.maximized ? " is-maximized" : ""}`}
        data-theme={state.settings.theme}
      >
        <div className="app-ambient" />
        <TitleBar />
        <LoginGate />
        <ToastLayer />
      </div>
    );
  }

  return (
    <div
      className={`app-window${state.windowState.maximized ? " is-maximized" : ""}`}
      data-theme={state.settings.theme}
      data-edition={state.edition}
      style={
        {
          "--sidebar-current": "64px",
        } as React.CSSProperties
      }
    >
      <div className="app-ambient" />
      <TitleBar />
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <div className="screen-scroll" id="main-content">
            <div key={state.route}>
              <CurrentScreen />
            </div>
          </div>
        </main>
      </div>
      <ActivityBar />
      <ToastLayer />
      <LaunchOverlay />
      <EulaDialog />
    </div>
  );
}
