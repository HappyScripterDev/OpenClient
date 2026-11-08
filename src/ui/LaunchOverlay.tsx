import { X } from "lucide-react";
import logo from "../../assets/OcTransparent.png";
import { appStore, useAppState } from "../lib/store";
import { Button } from "./Button";

export function LaunchOverlay() {
  const { launchOverlay } = useAppState();
  if (!launchOverlay?.active) return null;
  return (
    <div className="launch-overlay" role="dialog" aria-modal="true" aria-label={launchOverlay.title}>
      <div className="launch-overlay-inner">
        <img src={logo} alt="" />
        <div>
          <div className="launch-overlay-title">{launchOverlay.title}</div>
          <p className="launch-overlay-desc">{launchOverlay.description}</p>
        </div>
        <div className="launch-steps">
          <div className="activity-fill is-indeterminate" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<X size={14} />}
          onClick={() => appStore.dismissLaunchOverlay()}
        >
          Continue in background
        </Button>
      </div>
    </div>
  );
}
