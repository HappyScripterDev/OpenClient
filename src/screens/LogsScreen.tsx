import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  FileWarning,
  FolderOpen,
  RefreshCw,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import type { CrashReportInfo } from "../shared/types";
import { appStore, useAppState } from "../lib/store";
import { useLogs, logBuffer } from "../lib/logStore";
import {
  errorMessage,
  formatBytes,
  formatClock,
  formatDate,
  unwrap,
} from "../lib/format";
import { Button, IconButton } from "../ui/Button";
import { SearchInput } from "../ui/Field";
import { EmptyState, PageHeader } from "../ui/Feedback";
import { Badge, SectionHeader, StatusDot } from "../ui/Panel";
import { Dialog } from "../ui/Dialog";

type LevelFilter = "all" | "info" | "warn" | "error" | "game" | "debug";

export function LogsScreen() {
  const logs = useLogs();
  const { gameState, profiles, selectedProfileId } = useAppState();
  const [level, setLevel] = useState<LevelFilter>("all");
  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [crashes, setCrashes] = useState<CrashReportInfo[]>([]);
  const [crashLoading, setCrashLoading] = useState(false);
  const [crashOpen, setCrashOpen] = useState<CrashReportInfo | null>(null);
  const [crashText, setCrashText] = useState("");
  const [crashTextLoading, setCrashTextLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);

  const loadCrashes = useCallback(async () => {
    setCrashLoading(true);
    try {
      const reports = await unwrap(window.openclient.logs.crashReports());
      setCrashes(reports);
    } catch (error) {
      appStore.toast("Crash reports unavailable", "error", errorMessage(error));
    } finally {
      setCrashLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCrashes();
  }, [loadCrashes, gameState.running]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return logs
      .filter((entry) => {
        if (level !== "all" && entry.level !== level) return false;
        if (!normalized) return true;
        return (
          entry.message.toLowerCase().includes(normalized) ||
          entry.source.toLowerCase().includes(normalized)
        );
      })
      .slice(-2000);
  }, [logs, level, query]);

  useEffect(() => {
    if (!autoScroll) return;
    const node = outputRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [filtered, autoScroll]);

  const clearLogs = async (): Promise<void> => {
    try {
      await unwrap(window.openclient.logs.clear());
      logBuffer.clear();
      appStore.toast("Log cleared", "info");
    } catch (error) {
      appStore.toast("Could not clear log", "error", errorMessage(error));
    }
  };

  const openCrash = async (report: CrashReportInfo): Promise<void> => {
    setCrashOpen(report);
    setCrashText("");
    setCrashTextLoading(true);
    try {
      const text = await unwrap(window.openclient.logs.readCrash(report.path));
      setCrashText(text);
    } catch (error) {
      setCrashText(`Could not read the crash report.\n\n${errorMessage(error)}`);
    } finally {
      setCrashTextLoading(false);
    }
  };

  return (
    <div className="screen">
      <PageHeader
        eyebrow="Diagnostics"
        title="Logs & Console"
        subtitle="Live game output, launcher events and crash reports. Everything here stays on this computer."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FolderOpen size={15} />}
              onClick={() =>
                void window.openclient.logs
                  .openLogsFolder()
                  .catch((error) => appStore.toast("Could not open folder", "error", errorMessage(error)))
              }
            >
              Log folder
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 size={15} />}
              onClick={() => void clearLogs()}
            >
              Clear
            </Button>
          </>
        }
      />
      <div className="two-col">
        <div>
          <div className="toolbar">
            <div style={{ flex: 1, minWidth: 200 }}>
              <SearchInput value={query} onChange={setQuery} placeholder="Filter log output" />
            </div>
            <div style={{ width: 150 }}>
              <select
                className="input"
                value={level}
                onChange={(event) => setLevel(event.target.value as LevelFilter)}
                aria-label="Log level filter"
              >
                <option value="all">All levels</option>
                <option value="info">Info</option>
                <option value="warn">Warnings</option>
                <option value="error">Errors</option>
                <option value="game">Game</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            <Button
              variant={autoScroll ? "secondary" : "ghost"}
              size="sm"
              icon={<ArrowDownToLine size={14} />}
              onClick={() => setAutoScroll((current) => !current)}
            >
              Auto-scroll {autoScroll ? "on" : "off"}
            </Button>
          </div>
          <div className="console">
            <div className="console-toolbar">
              <StatusDot state={gameState.running ? "online" : "unknown"} pulse={gameState.running} />
              <span className="field-hint">
                {gameState.running
                  ? `Minecraft is running${selectedProfile ? ` · ${selectedProfile.name}` : ""}`
                  : "Minecraft is not running"}
              </span>
              <span className="grow" />
              <Badge variant="muted">{filtered.length} lines</Badge>
              <IconButton label="Refresh crash reports" size="sm" onClick={() => void loadCrashes()}>
                {crashLoading ? <span className="spinner" /> : <RefreshCw size={14} />}
              </IconButton>
            </div>
            <div className="console-output" ref={outputRef}>
              {filtered.length === 0 ? (
                <div className="empty" style={{ padding: 40 }}>
                  <div className="empty-icon">
                    <TerminalSquare size={22} />
                  </div>
                  <div className="empty-title">No log lines</div>
                  <p className="empty-text">
                    Launch the game or check for updates to see live output here.
                  </p>
                </div>
              ) : (
                filtered.map((entry) => (
                  <div className={`console-line is-${entry.level}`} key={entry.id}>
                    <span className="log-time">{formatClock(entry.timestamp)}</span>
                    <span className="log-level">{entry.level}</span>
                    <span className="log-source">{entry.source}</span>
                    <span className="log-message">{entry.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="vstack" style={{ gap: 12 }}>
          <SectionHeader
            title="Crash reports"
            description="Read from the selected profile's crash-reports folder."
            actions={
              <Button
                variant="ghost"
                size="sm"
                icon={<FolderOpen size={14} />}
                onClick={() =>
                  void window.openclient.logs
                    .openCrashFolder()
                    .catch((error) => appStore.toast("Could not open folder", "error", errorMessage(error)))
                }
              >
                Folder
              </Button>
            }
          />
          {crashes.length === 0 ? (
            <EmptyState
              icon={<FileWarning size={22} />}
              title="No crash reports"
              text="Minecraft writes a report here when the JVM crashes or a mod fails during startup."
            />
          ) : (
            <div className="vstack" style={{ gap: 8 }}>
              {crashes.slice(0, 12).map((report) => (
                <button
                  type="button"
                  key={report.id}
                  className="list-row"
                  style={{ textAlign: "left", cursor: "pointer" }}
                  onClick={() => void openCrash(report)}
                >
                  <div className="row-art" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileWarning size={16} />
                  </div>
                  <div className="row-main">
                    <div className="row-title">{report.fileName}</div>
                    <div className="row-sub">
                      <span>{formatDate(report.modifiedAt)}</span>
                      <span>·</span>
                      <span>{formatBytes(report.sizeBytes)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="notice">
            <TerminalSquare size={16} />
            <div>
              <div className="notice-title">Tokens are redacted</div>
              OpenClient removes access tokens from captured game output before it is written to
              disk or shown here.
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={crashOpen !== null}
        onClose={() => setCrashOpen(null)}
        title={crashOpen?.fileName ?? "Crash report"}
        description={crashOpen ? formatDate(crashOpen.modifiedAt) : undefined}
        width="wide"
        footer={
          <>
            <Button
              variant="secondary"
              icon={<FolderOpen size={15} />}
              onClick={() => {
                if (crashOpen) {
                  void window.openclient.app
                    .revealPath(crashOpen.path)
                    .catch((error) => appStore.toast("Could not reveal file", "error", errorMessage(error)));
                }
              }}
            >
              Show in folder
            </Button>
            <span className="spacer" />
            <Button variant="ghost" onClick={() => setCrashOpen(null)}>
              Close
            </Button>
          </>
        }
      >
        {crashTextLoading ? (
          <div className="vstack">
            {Array.from({ length: 10 }, (_, index) => (
              <div className="skeleton skeleton-line" key={index} style={{ width: `${60 + (index % 4) * 10}%` }} />
            ))}
          </div>
        ) : (
          <pre className="log-well" style={{ maxHeight: "55vh" }}>
            {crashText || crashOpen?.preview}
          </pre>
        )}
      </Dialog>
    </div>
  );
}
