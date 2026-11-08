import {
  Boxes,
  Globe2,
  Home,
  LayoutGrid,
  Monitor,
  Package,
  Puzzle,
  Server,
  Settings2,
  TerminalSquare,
  UserRound,
} from "lucide-react";
import { appStore, useAppState, type RouteId } from "../lib/store";
import { classNames } from "../lib/format";
import { useEditionNav } from "./TitleBar";

const ICONS: Record<RouteId, typeof Home> = {
  home: Home,
  profiles: LayoutGrid,
  mods: Puzzle,
  hud: Monitor,
  packs: Package,
  servers: Server,
  accounts: UserRound,
  logs: TerminalSquare,
  settings: Settings2,
  "bedrock-content": Boxes,
  "bedrock-worlds": Globe2,
};

export function Sidebar() {
  const { route } = useAppState();
  const nav = useEditionNav();
  const main = nav.filter((item) => item.route !== "settings");
  const settings = nav.find((item) => item.route === "settings");

  return (
    <aside className="sidebar rail" aria-label="Navigation">
      <nav className="rail-nav">
        {main.map((item) => {
          const Icon = ICONS[item.route];
          return (
            <button
              key={item.route}
              type="button"
              className={classNames("rail-item", route === item.route && "is-active")}
              onClick={() => appStore.navigate(item.route)}
              aria-current={route === item.route ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
            >
              <Icon size={26} strokeWidth={1.8} />
            </button>
          );
        })}
      </nav>
      <div className="rail-bottom">
        {settings ? (
          <button
            type="button"
            className={classNames("rail-item", route === settings.route && "is-active")}
            onClick={() => appStore.navigate(settings.route)}
            aria-current={route === settings.route ? "page" : undefined}
            aria-label={settings.label}
            title={settings.label}
          >
            <Settings2 size={26} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
    </aside>
  );
}
