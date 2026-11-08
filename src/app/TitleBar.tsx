import { Boxes, Coffee, Minus, Square, Copy, X } from "lucide-react";
import logo from "../../assets/OcTransparent.png";
import { appStore, useAppState } from "../lib/store";
import { classNames } from "../lib/format";
import { Avatar } from "../ui/Avatar";

export function TitleBar() {
  const { edition, accounts, info, windowState } = useAppState();
  const activeAccount = accounts.find((account) => account.active);
  const isMac = info?.platform === "darwin";

  return (
    <header
      className={classNames("titlebar", isMac && "is-mac")}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest(".window-controls, .titlebar-right")) return;
        void window.openclient.app.window.toggleMaximize();
      }}
    >
      <div className="titlebar-brand">
        <img className="brand-mark" src={logo} alt="" />
        <span className="brand-name">OpenClient</span>
      </div>
      <div className="titlebar-right">
        <div className="titlebar-edition" data-edition={edition}>
          <button
            type="button"
            className={classNames("titlebar-edition-btn", edition === "java" && "is-active")}
            onClick={() => void appStore.setEdition("java")}
            aria-pressed={edition === "java"}
            title="Java Edition"
          >
            <Coffee size={13} />
            Java
          </button>
          <button
            type="button"
            className={classNames("titlebar-edition-btn", edition === "bedrock" && "is-active")}
            onClick={() => void appStore.setEdition("bedrock")}
            aria-pressed={edition === "bedrock"}
            title="Bedrock Edition"
          >
            <Boxes size={13} />
            Bedrock
          </button>
        </div>
        <button
          type="button"
          className="titlebar-account"
          onClick={() => appStore.navigate("accounts")}
          title={activeAccount ? activeAccount.username : "Accounts"}
          aria-label="Accounts"
        >
          {activeAccount ? (
            <Avatar uuid={activeAccount.uuid} name={activeAccount.username} size={28} />
          ) : (
            <span className="avatar-fallback" style={{ width: 28, height: 28, borderRadius: 9 }}>
              ?
            </span>
          )}
        </button>
        {!isMac ? (
          <div className="window-controls">
            <button
              type="button"
              className="window-btn"
              aria-label="Minimize"
              title="Minimize"
              onClick={() => void window.openclient.app.window.minimize()}
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              className="window-btn"
              aria-label={windowState.maximized ? "Restore" : "Maximize"}
              title={windowState.maximized ? "Restore" : "Maximize"}
              onClick={() => void window.openclient.app.window.toggleMaximize()}
            >
              {windowState.maximized ? <Copy size={12} /> : <Square size={12} />}
            </button>
            <button
              type="button"
              className="window-btn is-close"
              aria-label="Close to tray"
              title="Close to tray"
              onClick={() => void window.openclient.app.window.close()}
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function useEditionNav(): { route: import("../lib/store").RouteId; label: string }[] {
  const { edition } = useAppState();
  return edition === "java"
    ? [
        { route: "home", label: "Home" },
        { route: "profiles", label: "Profiles" },
        { route: "mods", label: "Mods" },
        { route: "hud", label: "HUD" },
        { route: "packs", label: "Packs" },
        { route: "servers", label: "Servers" },
        { route: "accounts", label: "Accounts" },
        { route: "logs", label: "Logs" },
        { route: "settings", label: "Settings" },
      ]
    : [
        { route: "home", label: "Home" },
        { route: "profiles", label: "Profiles" },
        { route: "bedrock-content", label: "Content" },
        { route: "bedrock-worlds", label: "Worlds" },
        { route: "servers", label: "Servers" },
        { route: "accounts", label: "Accounts" },
        { route: "logs", label: "Logs" },
        { route: "settings", label: "Settings" },
      ];
}
