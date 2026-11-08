import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Globe2,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Star,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type {
  Edition,
  ServerEntry,
  ServerPingResult,
} from "../shared/types";
import { appStore, useAppState } from "../lib/store";
import {
  classNames,
  errorMessage,
  formatNumber,
  loaderLabel,
  pingQuality,
  unwrap,
} from "../lib/format";
import { Button, IconButton } from "../ui/Button";
import { Field, Input, SearchInput } from "../ui/Field";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Controls";
import { Badge } from "../ui/Panel";
import { EmptyState, PageHeader } from "../ui/Feedback";
import { Dialog } from "../ui/Dialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface PingState {
  loading: boolean;
  result?: ServerPingResult;
}

const EDITION_OPTIONS = [
  { value: "java", label: "Java Edition" },
  { value: "bedrock", label: "Bedrock Edition" },
  { value: "both", label: "Cross-play (both)" },
];

const CROSSPLAY_OPTIONS = [
  { value: "java", label: "Java only" },
  { value: "bedrock", label: "Bedrock only" },
  { value: "both", label: "Both editions" },
  { value: "unknown", label: "Unknown" },
];

export function ServersScreen() {
  const { edition, profiles, selectedProfileId, settings } = useAppState();
  const profile = profiles.find((entry) => entry.id === selectedProfileId);
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [pings, setPings] = useState<Record<string, PingState>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServerEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await unwrap(window.openclient.servers.list());
      setServers(entries);
      void pingAll(entries);
    } catch (error) {
      appStore.toast("Server list unavailable", "error", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const pingOne = useCallback(async (server: ServerEntry) => {
    setPings((current) => ({
      ...current,
      [server.id]: { ...current[server.id], loading: true },
    }));
    try {
      const result = await unwrap(window.openclient.servers.ping(server.id));
      setPings((current) => ({
        ...current,
        [server.id]: { loading: false, result },
      }));
    } catch {
      setPings((current) => ({
        ...current,
        [server.id]: { loading: false },
      }));
    }
  }, []);

  const pingAll = useCallback(
    (entries: ServerEntry[]) => {
      void Promise.all(entries.map((server) => pingOne(server)));
    },
    [pingOne],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (servers.length > 0) pingAll(servers);
    }, 90000);
    return () => window.clearInterval(timer);
  }, [servers, pingAll]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return servers.filter((server) => {
      if (filter === "favorites" && !server.favorite) return false;
      if (!normalized) return true;
      return (
        server.name.toLowerCase().includes(normalized) ||
        server.address.toLowerCase().includes(normalized) ||
        server.notes.toLowerCase().includes(normalized)
      );
    });
  }, [servers, filter, query]);

  const toggleFavorite = async (server: ServerEntry): Promise<void> => {
    try {
      const updated = await unwrap(
        window.openclient.servers.update(server.id, { favorite: !server.favorite }),
      );
      setServers((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (error) {
      appStore.toast("Could not update favorite", "error", errorMessage(error));
    }
  };

  const canJoin = (server: ServerEntry): boolean => {
    if (server.edition === "both") return true;
    return server.edition === edition;
  };

  const join = async (server: ServerEntry): Promise<void> => {
    if (!canJoin(server)) {
      appStore.toast(
        "Wrong edition",
        "warning",
        `This server is ${server.edition === "java" ? "Java" : "Bedrock"} only. Switch edition in the sidebar.`,
      );
      return;
    }
    setJoinBusy(server.id);
    try {
      if (edition === "java") {
        if (!profile || profile.edition !== "java") {
          throw new Error("Select a Java profile before joining");
        }
        await appStore.launchProfile(profile.id, {
          server: server.address,
          port: server.port,
        });
      } else {
        if (!profile || profile.edition !== "bedrock") {
          throw new Error("Select a Bedrock profile before joining");
        }
        await unwrap(window.openclient.servers.join(server.id, profile.id));
        appStore.toast(
          "Bedrock is opening",
          "success",
          `${server.name} was added to the server list. Select it in the game to join.`,
        );
      }
      const updated = await unwrap(
        window.openclient.servers.update(server.id, { lastPlayed: Date.now() }),
      );
      setServers((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (error) {
      appStore.toast("Could not join", "error", errorMessage(error));
    } finally {
      setJoinBusy(null);
    }
  };

  const remove = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await unwrap(window.openclient.servers.remove(deleteTarget.id));
      setServers((current) => current.filter((entry) => entry.id !== deleteTarget.id));
      setDeleteTarget(null);
      appStore.toast("Server removed", "info", deleteTarget.name);
    } catch (error) {
      appStore.toast("Could not remove server", "error", errorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="screen">
      <PageHeader
        eyebrow={edition === "java" ? "Java Edition" : "Bedrock Edition"}
        title="Servers"
        subtitle="Live status for both editions. Cross-play tags show which edition a server supports."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} />}
              onClick={() => pingAll(servers)}
            >
              Refresh pings
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Add server
            </Button>
          </>
        }
      />
      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Server filter">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={classNames("segment", filter === "all" && "is-active")}
            onClick={() => setFilter("all")}
          >
            All servers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "favorites"}
            className={classNames("segment", filter === "favorites" && "is-active")}
            onClick={() => setFilter("favorites")}
          >
            Favorites
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search servers" dataGlobalSearch />
        </div>
        <Badge variant="muted">
          <Globe2 size={12} /> {servers.length} saved
        </Badge>
      </div>

      {loading ? (
        <div className="vstack">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton" key={index} style={{ height: 82 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Server size={24} />}
          title={filter === "favorites" ? "No favorite servers" : "No servers yet"}
          text="Add a server address. OpenClient pings it with the official Java and Bedrock protocols and stores only the address you provide."
          action={
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Add server
            </Button>
          }
        />
      ) : (
        <div className="vstack" style={{ gap: 8 }}>
          {filtered.map((server) => {
            const ping = pings[server.id];
            const result = ping?.result;
            const supported = canJoin(server);
            const quality = result?.online ? pingQuality(result.latencyMs) : "none";
            return (
              <div className="server-row" key={server.id}>
                <button
                  type="button"
                  className={`icon-btn favorite-btn${server.favorite ? " is-on" : ""}`}
                  aria-label={server.favorite ? "Remove favorite" : "Add favorite"}
                  title={server.favorite ? "Remove favorite" : "Add favorite"}
                  onClick={() => void toggleFavorite(server)}
                >
                  <Star size={16} fill={server.favorite ? "currentColor" : "none"} />
                </button>
                <div className="server-main">
                  <div className="server-title-row">
                    <span className="server-name">{server.name}</span>
                    <Badge variant={server.crossPlay === "both" ? "success" : server.crossPlay === "unknown" ? "muted" : "accent"}>
                      {server.crossPlay === "both"
                        ? "Cross-play"
                        : server.crossPlay === "java"
                          ? "Java"
                          : server.crossPlay === "bedrock"
                            ? "Bedrock"
                            : "Unknown"}
                    </Badge>
                    {result?.version ? <Badge variant="muted">{result.version}</Badge> : null}
                  </div>
                  <div className="server-address">
                    {server.address}:{server.port}
                  </div>
                  <div className="server-motd">
                    {ping?.loading && !result
                      ? "Pinging server"
                      : result?.online
                        ? result.motd || "No message of the day"
                        : result?.error
                          ? result.error
                          : "Not checked"}
                  </div>
                </div>
                <div className="server-players">
                  {result?.online
                    ? `${formatNumber(result.playersOnline)} / ${formatNumber(result.playersMax)}`
                    : "—"}
                </div>
                <div className="server-ping">
                  <span className={`ping-bars ${quality}`}>
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  {result?.online ? `${result.latencyMs} ms` : "Offline"}
                </div>
                <div className="row-actions">
                  <IconButton
                    label={`Ping ${server.name}`}
                    size="sm"
                    onClick={() => void pingOne(server)}
                  >
                    {ping?.loading ? <span className="spinner" /> : <Wifi size={14} />}
                  </IconButton>
                  <Button
                    variant={supported ? "primary" : "secondary"}
                    size="sm"
                    disabled={!supported}
                    loading={joinBusy === server.id}
                    title={supported ? "Join this server" : `Switch to ${server.edition === "java" ? "Java" : "Bedrock"} edition`}
                    onClick={() => void join(server)}
                  >
                    Join
                  </Button>
                  <IconButton
                    label={`Edit ${server.name}`}
                    size="sm"
                    onClick={() => {
                      setEditing(server);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${server.name}`}
                    size="sm"
                    onClick={() => setDeleteTarget(server)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="notice mt-4">
        <Wifi size={16} />
        <div>
          <div className="notice-title">How pings work</div>
          Java servers use the official Server List Ping handshake. Bedrock servers use a RakNet
          unconnected ping. If either protocol is blocked by a firewall, the server is reported as
          offline. Cross-play is user-maintained metadata; OpenClient does not guess it.
        </div>
      </div>
      {!settings.eulaAccepted && edition === "java" ? (
        <div className="notice is-warning mt-3">
          <WifiOff size={16} />
          <div>
            The Minecraft EULA must be accepted once before OpenClient can launch Java and join a
            server.
          </div>
        </div>
      ) : null}
      {edition === "java" && profile && profile.edition === "java" ? (
        <div className="field-hint mt-3">
          Joining launches {profile.name} with {loaderLabel(profile.loader)} {profile.gameVersion} and
          pre-fills the server address.
        </div>
      ) : null}

      <ServerDialog
        open={dialogOpen}
        server={editing}
        edition={edition}
        onClose={() => setDialogOpen(false)}
        onSaved={(server) => {
          setDialogOpen(false);
          setServers((current) => {
            const exists = current.some((entry) => entry.id === server.id);
            return exists
              ? current.map((entry) => (entry.id === server.id ? server : entry))
              : [...current, server];
          });
          void pingOne(server);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Remove ${deleteTarget?.name ?? "server"}`}
        description="Only the saved entry is removed. Nothing on the server or in Minecraft is changed."
        confirmLabel="Remove server"
        danger
        busy={deleteBusy}
        onConfirm={() => void remove()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function ServerDialog({
  open,
  server,
  edition,
  onClose,
  onSaved,
}: {
  open: boolean;
  server: ServerEntry | null;
  edition: Edition;
  onClose: () => void;
  onSaved: (server: ServerEntry) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("25565");
  const [serverEdition, setServerEdition] = useState<Edition | "both">("both");
  const [crossPlay, setCrossPlay] = useState<"java" | "bedrock" | "both" | "unknown">("both");
  const [favorite, setFavorite] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (server) {
      setName(server.name);
      setAddress(server.address);
      setPort(String(server.port));
      setServerEdition(server.edition);
      setCrossPlay(server.crossPlay);
      setFavorite(server.favorite);
      setNotes(server.notes);
    } else {
      setName("");
      setAddress("");
      setPort(edition === "bedrock" ? "19132" : "25565");
      setServerEdition(edition === "bedrock" ? "bedrock" : "both");
      setCrossPlay(edition === "bedrock" ? "bedrock" : "both");
      setFavorite(false);
      setNotes("");
    }
  }, [open, server, edition]);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      const payload = {
        name: name.trim() || address.trim(),
        address: address.trim(),
        port: Number(port) || (serverEdition === "bedrock" ? 19132 : 25565),
        edition: serverEdition,
        crossPlay,
        favorite,
        notes,
        lastPlayed: server?.lastPlayed,
      };
      const saved = server
        ? await unwrap(window.openclient.servers.update(server.id, payload))
        : await unwrap(window.openclient.servers.add(payload));
      appStore.toast(server ? "Server updated" : "Server added", "success", saved.name);
      onSaved(saved);
    } catch (error) {
      appStore.toast("Could not save server", "error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={server ? "Edit server" : "Add server"}
      description="OpenClient stores the address locally and never sends account credentials to a server list."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!address.trim()}
            onClick={() => void save()}
          >
            {server ? "Save changes" : "Add server"}
          </Button>
        </>
      }
    >
      <div className="vstack" style={{ gap: 14 }}>
        <Field label="Display name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My server"
          />
        </Field>
        <div className="form-grid">
          <Field label="Address" hint="Hostname or IP. Do not include a protocol prefix.">
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={serverEdition === "bedrock" ? "play.example.net" : "mc.example.net"}
              mono
            />
          </Field>
          <Field label="Port">
            <Input
              value={port}
              onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              mono
            />
          </Field>
          <Field label="Server edition">
            <Select
              value={serverEdition}
              onChange={(value) => {
                const next = value as Edition | "both";
                setServerEdition(next);
                if (next === "bedrock") setPort("19132");
                if (next === "java") setPort("25565");
              }}
              options={EDITION_OPTIONS}
              ariaLabel="Server edition"
            />
          </Field>
          <Field label="Cross-play support" hint="Shown in the list. Use Both only if the server offers both.">
            <Select
              value={crossPlay}
              onChange={(value) => setCrossPlay(value as typeof crossPlay)}
              options={CROSSPLAY_OPTIONS}
              ariaLabel="Cross-play support"
            />
          </Field>
        </div>
        <Field label="Notes" optional>
          <textarea
            className="textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Region, game mode or who plays here"
            rows={3}
          />
        </Field>
        <div className="setting-row" style={{ padding: 0, border: 0 }}>
          <div className="setting-info">
            <div className="setting-name">Favorite</div>
            <div className="setting-hint">Show this server at the top of the list.</div>
          </div>
          <div className="setting-control">
            <Switch checked={favorite} onChange={setFavorite} label="Favorite server" />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
