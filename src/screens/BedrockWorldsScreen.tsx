import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  Copy,
  Download,
  FolderOpen,
  Globe2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import type { BedrockStatus, BedrockWorldEntry } from "../shared/types";
import { appStore } from "../lib/store";
import { errorMessage, formatBytes, formatDate, unwrap } from "../lib/format";
import { Button, IconButton } from "../ui/Button";
import { Badge } from "../ui/Panel";
import { EmptyState, PageHeader } from "../ui/Feedback";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Skeleton } from "../ui/Feedback";

export function BedrockWorldsScreen() {
  const [status, setStatus] = useState<BedrockStatus | null>(null);
  const [worlds, setWorlds] = useState<BedrockWorldEntry[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<{ action: "restore" | "delete"; world: BedrockWorldEntry } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextWorlds] = await Promise.all([
        unwrap(window.openclient.bedrock.status()),
        unwrap(window.openclient.bedrock.worlds()).catch(() => []),
      ]);
      setStatus(nextStatus);
      setWorlds(nextWorlds);
    } catch (error) {
      appStore.toast("Worlds unavailable", "error", errorMessage(error));
      setWorlds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const backup = async (world: BedrockWorldEntry): Promise<void> => {
    setBusyId(world.id);
    try {
      const path = await unwrap(window.openclient.bedrock.backupWorld(world.id));
      await load();
      appStore.toast("World backed up", "success", path);
    } catch (error) {
      appStore.toast("Backup failed", "error", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (world: BedrockWorldEntry): Promise<void> => {
    setBusyId(world.id);
    try {
      const copy = await unwrap(window.openclient.bedrock.duplicateWorld(world.id));
      await load();
      appStore.toast("World duplicated", "success", copy.name);
    } catch (error) {
      appStore.toast("Duplicate failed", "error", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const exportWorld = async (world: BedrockWorldEntry): Promise<void> => {
    setBusyId(world.id);
    try {
      const path = await unwrap(window.openclient.bedrock.exportWorld(world.id));
      if (path) appStore.toast("World exported", "success", path);
    } catch (error) {
      appStore.toast("Export failed", "error", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const importWorld = async (): Promise<void> => {
    const selected = await unwrap(
      window.openclient.app.pickFile("Import Bedrock world", [
        { name: "Minecraft Bedrock world", extensions: ["mcworld", "mctemplate", "zip"] },
      ]),
    );
    if (!selected) return;
    setImporting(true);
    try {
      const world = await unwrap(window.openclient.bedrock.importWorld(selected));
      await load();
      appStore.toast("World imported", "success", world.name);
    } catch (error) {
      appStore.toast("Import failed", "error", errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  const runConfirm = async (): Promise<void> => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.action === "restore") {
        await unwrap(window.openclient.bedrock.restoreWorld(confirm.world.id));
        appStore.toast("World restored", "success", confirm.world.name);
      } else {
        await unwrap(window.openclient.bedrock.deleteWorld(confirm.world.id));
        appStore.toast("World deleted", "info", confirm.world.name);
      }
      setConfirm(null);
      await load();
    } catch (error) {
      appStore.toast(
        confirm.action === "restore" ? "Restore failed" : "Delete failed",
        "error",
        errorMessage(error),
      );
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="screen">
      <PageHeader
        eyebrow="Bedrock Edition"
        title="Worlds"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FolderOpen size={15} />}
              disabled={!status?.gameDir}
              onClick={() => void window.openclient.app.openPath(status?.gameDir ?? "")}
            >
              com.mojang
            </Button>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} />}
              onClick={() => void load()}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={<Upload size={15} />}
              loading={importing}
              disabled={!status?.supported}
              onClick={() => void importWorld()}
            >
              Import world
            </Button>
          </>
        }
      />
      <p className="field-hint" style={{ marginTop: -10, marginBottom: 18, maxWidth: 760 }}>
        Backups are zip archives in the OpenClient data folder. Restoring replaces the world folder
        exactly, duplicating creates a new world ID, and exporting produces a .mcworld file you can
        share or move to another device.
      </p>

      {loading ? (
        <div className="vstack">
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      ) : !status?.supported ? (
        <EmptyState
          icon={<Globe2 size={24} />}
          title="Bedrock is Windows-only"
          text="Its world data is not accessible on consoles or mobile. Java Edition continues to work on this platform."
        />
      ) : (worlds?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Globe2 size={24} />}
          title="No Bedrock worlds found"
          text="Launch Bedrock once to create a world, or import a .mcworld file."
          action={
            <Button variant="primary" icon={<Upload size={15} />} loading={importing} onClick={() => void importWorld()}>
              Import world
            </Button>
          }
        />
      ) : (
        <div className="card-grid">
          {worlds?.map((world) => (
            <div className="world-card" key={world.id}>
              {world.iconDataUrl ? (
                <img className="world-icon" src={world.iconDataUrl} alt="" />
              ) : (
                <div className="world-icon-fallback">
                  <Globe2 size={22} />
                </div>
              )}
              <div className="world-main">
                <div className="hstack">
                  <span className="world-name">{world.name}</span>
                  {world.hasBackup ? <Badge variant="success">Backup</Badge> : null}
                </div>
                <div className="world-meta">
                  <span>{formatBytes(world.sizeBytes)}</span>
                  <span>·</span>
                  <span>{formatDate(world.lastModified)}</span>
                </div>
                <div className="world-actions">
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={<Archive size={13} />}
                    loading={busyId === world.id}
                    onClick={() => void backup(world)}
                  >
                    Backup
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<RotateCcw size={13} />}
                    disabled={!world.hasBackup}
                    onClick={() => setConfirm({ action: "restore", world })}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Copy size={13} />}
                    onClick={() => void duplicate(world)}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Download size={13} />}
                    onClick={() => void exportWorld(world)}
                  >
                    Export
                  </Button>
                  <IconButton
                    label={`Delete ${world.name}`}
                    size="sm"
                    onClick={() => setConfirm({ action: "delete", world })}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.action === "restore"
            ? `Restore ${confirm.world.name}`
            : `Delete ${confirm?.world.name ?? "world"}`
        }
        description={
          confirm?.action === "restore"
            ? "The current world folder is replaced by the latest backup. Make a fresh backup first if you are unsure."
            : "The world folder is permanently removed from com.mojang. Export it first if you want to keep a copy."
        }
        confirmLabel={confirm?.action === "restore" ? "Restore backup" : "Delete world"}
        danger={confirm?.action === "delete"}
        busy={confirmBusy}
        onConfirm={() => void runConfirm()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
