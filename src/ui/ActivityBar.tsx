import { ArrowDownToLine, Check, Loader2 } from "lucide-react";
import { useTransfer } from "../lib/transferStore";
import { formatBytes } from "../lib/format";

export function ActivityBar() {
  const progress = useTransfer();
  if (!progress) return null;
  const percent =
    progress.bytesTotal > 0
      ? Math.min(100, Math.round((progress.bytesReceived / progress.bytesTotal) * 100))
      : progress.filesTotal > 0
        ? Math.round((progress.filesDone / progress.filesTotal) * 100)
        : null;
  return (
    <div className="activity-bar" role="status" aria-live="polite">
      <div className="activity-icon">
        {progress.done ? (
          <Check size={17} />
        ) : percent === null ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <ArrowDownToLine size={17} />
        )}
      </div>
      <div className="activity-main">
        <div className="activity-top">
          <span className="activity-label">{progress.label}</span>
          <span className="activity-detail">
            {progress.filesTotal > 0
              ? `${progress.filesDone} / ${progress.filesTotal} files`
              : ""}
            {progress.bytesTotal > 0
              ? ` · ${formatBytes(progress.bytesReceived)} / ${formatBytes(progress.bytesTotal)}`
              : ""}
            {percent !== null ? ` · ${percent}%` : ""}
          </span>
        </div>
        <div className="activity-track">
          <div
            className={`activity-fill${percent === null ? " is-indeterminate" : ""}`}
            style={percent !== null ? { width: `${percent}%` } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
