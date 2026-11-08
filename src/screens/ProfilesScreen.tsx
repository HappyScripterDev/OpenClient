import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Coffee,
  Copy,
  FolderOpen,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import type {
  LoaderType,
  MojangVersionSummary,
  Profile,
} from "../shared/types";
import { JVM_PRESETS, parseExtraJvmArgs, recommendMemoryMb } from "../shared/jvm";
import { appStore, useAppState } from "../lib/store";
import {
  errorMessage,
  formatBytes,
  loaderLabel,
  requiredJavaMajor,
  timeAgo,
  unwrap,
} from "../lib/format";
import { Button, IconButton } from "../ui/Button";
import { Field, Input } from "../ui/Field";
import { Select } from "../ui/Select";
import { Range } from "../ui/Controls";
import { Tabs } from "../ui/Tabs";
import { Badge, SectionHeader } from "../ui/Panel";
import { EmptyState, PageHeader, Skeleton } from "../ui/Feedback";
import { Dialog } from "../ui/Dialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";

const LOADER_OPTIONS: { value: LoaderType; label: string }[] = [
  { value: "vanilla", label: "Vanilla" },
  { value: "fabric", label: "Fabric" },
  { value: "quilt", label: "Quilt" },
  { value: "forge", label: "Forge" },
  { value: "neoforge", label: "NeoForge" },
];

type EditorTab = "general" | "runtime" | "files" | "content";

export function ProfilesScreen() {
  const { profiles, edition, selectedProfileId, settings } = useAppState();
  const editionProfiles = profiles.filter((profile) => profile.edition === edition);
  const [editorProfile, setEditorProfile] = useState<Profile | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const duplicate = async (profile: Profile): Promise<void> => {
    setBusyId(profile.id);
    try {
      const copy = await unwrap(window.openclient.profiles.duplicate(profile.id));
      await appStore.refreshProfiles();
      await appStore.selectProfile(copy.id);
      appStore.toast("Profile duplicated", "success", copy.name);
    } catch (error) {
      appStore.toast("Could not duplicate", "error", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await unwrap(window.openclient.profiles.remove(deleteTarget.id));
      await appStore.refreshProfiles();
      await appStore.refreshSettings();
      appStore.toast("Profile deleted", "info", "Game files were kept on disk.");
      setDeleteTarget(null);
    } catch (error) {
      appStore.toast("Could not delete profile", "error", errorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="screen">
      <PageHeader
        eyebrow={edition === "java" ? "Java Edition" : "Bedrock Edition"}
        title="Profiles"
        subtitle={
          edition === "java"
            ? "Each profile owns its version, loader, mods, packs, JVM settings and game directory."
            : "Bedrock profiles keep a local working folder. Content, worlds and options are shared through the Bedrock com.mojang data folder."
        }
        actions={
          <>
            <Button variant="secondary" icon={<LayoutGrid size={15} />} onClick={() => appStore.navigate(edition === "java" ? "mods" : "bedrock-content")}>
              {edition === "java" ? "Mods" : "Content"}
            </Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
              New profile
            </Button>
          </>
        }
      />
      {editionProfiles.length === 0 ? (
        <EmptyState
          icon={edition === "java" ? <Coffee size={24} /> : <Boxes size={24} />}
          title={`No ${edition === "java" ? "Java" : "Bedrock"} profiles`}
          text={
            edition === "java"
              ? "Create a profile, choose a Minecraft version and a loader, then press Play."
              : "Create a Bedrock profile to launch the game and manage your worlds from OpenClient."
          }
          action={
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
              Create profile
            </Button>
          }
        />
      ) : (
        <div className="card-grid">
          {editionProfiles.map((profile) => {
            const selected = profile.id === selectedProfileId;
            const javaProfile = profile.edition === "java" ? profile : null;
            return (
              <article
                className={`profile-card${selected ? " is-selected" : ""}`}
                key={profile.id}
              >
                <div className="profile-title-row">
                  <div className="grow">
                    <div className="hstack">
                      <h3 className="profile-name">{profile.name}</h3>
                      {selected ? <Badge variant="accent">Active</Badge> : null}
                    </div>
                    <p className="profile-meta">
                      <span className={`edition-pill ${profile.edition}`}>
                        {profile.edition === "java" ? "Java" : "Bedrock"}
                      </span>
                      {javaProfile
                        ? `${javaProfile.gameVersion} · ${loaderLabel(javaProfile.loader)}${javaProfile.loaderVersion ? ` ${javaProfile.loaderVersion}` : ""}`
                        : "Bedrock Edition"}
                    </p>
                  </div>
                </div>
                {javaProfile ? (
                  <>
                    <div className="profile-stats">
                      <span>{javaProfile.memoryMb} MB</span>
                      <span>{javaProfile.mods.length} mods</span>
                      <span>{javaProfile.resourcePacks.length} packs</span>
                      <span>{javaProfile.shaderPacks.length} shaders</span>
                    </div>
                    <div className="field-hint">
                      Last played {timeAgo(javaProfile.lastPlayed)} · Java {requiredJavaMajor(javaProfile.gameVersion)}
                      {javaProfile.performancePreset ? ` · ${javaProfile.performancePreset}` : ""}
                    </div>
                  </>
                ) : (
                  <div className="field-hint">
                    Launches the installed Bedrock app. Content and worlds are managed globally.
                  </div>
                )}
                <div className="profile-actions">
                  <Button
                    variant={selected ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => void appStore.selectProfile(profile.id)}
                    icon={selected ? <ShieldCheck size={14} /> : undefined}
                  >
                    {selected ? "Selected" : "Select"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil size={14} />}
                    onClick={() => setEditorProfile(profile)}
                  >
                    Edit
                  </Button>
                  <IconButton
                    label={`Duplicate ${profile.name}`}
                    size="sm"
                    disabled={busyId === profile.id}
                    onClick={() => void duplicate(profile)}
                  >
                    {busyId === profile.id ? <Loader2 size={14} className="spin-icon" /> : <Copy size={14} />}
                  </IconButton>
                  <IconButton
                    label={`Delete ${profile.name}`}
                    size="sm"
                    onClick={() => setDeleteTarget(profile)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="notice mt-4">
        <Settings2 size={16} />
        <div>
          <div className="notice-title">Edition-aware workspace</div>
          The edition switch in the sidebar changes which profiles, content screens and quick
          statistics are shown. A Java profile can never be launched as Bedrock and vice versa.
        </div>
      </div>

      <CreateProfileDialog
        open={createOpen}
        edition={edition}
        onClose={() => setCreateOpen(false)}
        onCreated={(profile) => {
          setCreateOpen(false);
          void appStore.refreshProfiles().then(() => appStore.selectProfile(profile.id));
          setEditorProfile(profile);
        }}
      />

      {editorProfile ? (
        <ProfileEditorDialog
          profile={editorProfile}
          open
          showSnapshots={settings.showSnapshots}
          onClose={() => setEditorProfile(null)}
          onSaved={(profile) => {
            setEditorProfile(null);
            void appStore.refreshProfiles().then(() => appStore.selectProfile(profile.id));
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name ?? "profile"}`}
        description="The profile entry is removed. Game files and installed content stay on disk so nothing is lost by accident."
        confirmLabel="Delete profile"
        danger
        busy={deleteBusy}
        onConfirm={() => void remove()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function CreateProfileDialog({
  open,
  edition,
  onClose,
  onCreated,
}: {
  open: boolean;
  edition: "java" | "bedrock";
  onClose: () => void;
  onCreated: (profile: Profile) => void;
}) {
  const [name, setName] = useState("");
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState<LoaderType>("fabric");
  const [versions, setVersions] = useState<MojangVersionSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || edition !== "java") return;
    let cancelled = false;
    void window.openclient.java
      .latestVersion()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setGameVersion((current) => current || result.data.release);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, edition]);

  useEffect(() => {
    if (!open || edition !== "java") return;
    let cancelled = false;
    setVersions(null);
    void window.openclient.java
      .versions(false)
      .then((result) => {
        if (!cancelled && result.ok) setVersions(result.data);
      })
      .catch(() => setVersions([]));
    return () => {
      cancelled = true;
    };
  }, [open, edition]);

  const create = async (): Promise<void> => {
    setBusy(true);
    try {
      const profile = await unwrap(
        window.openclient.profiles.create({
          name: name.trim() || (edition === "java" ? "New profile" : "Bedrock"),
          edition,
          gameVersion: edition === "java" ? gameVersion : undefined,
          loader: edition === "java" ? loader : undefined,
        }),
      );
      setName("");
      onCreated(profile);
    } catch (error) {
      appStore.toast("Could not create profile", "error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create profile"
      description={
        edition === "java"
          ? "Choose a Minecraft version and loader. You can change both later."
          : "Bedrock profiles organise launching and local data. Game content is managed globally."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={edition === "java" && (!gameVersion || versions === null)}
            onClick={() => void create()}
          >
            Create profile
          </Button>
        </>
      }
    >
      <div className="vstack" style={{ gap: 14 }}>
        <Field label="Profile name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={edition === "java" ? "Main" : "Bedrock"}
          />
        </Field>
        {edition === "java" ? (
          <>
            <Field label="Minecraft version" hint="Only release versions are shown here. Enable snapshots in Settings.">
              {versions === null ? (
                <Skeleton height={42} />
              ) : (
                <Select
                  value={gameVersion}
                  onChange={setGameVersion}
                  options={versions.map((version) => ({
                    value: version.id,
                    label: version.id,
                    description: version.type,
                  }))}
                  placeholder="Choose a version"
                  ariaLabel="Minecraft version"
                />
              )}
            </Field>
            <Field label="Mod loader">
              <Select
                value={loader}
                onChange={(value) => setLoader(value as LoaderType)}
                options={LOADER_OPTIONS}
                ariaLabel="Mod loader"
              />
            </Field>
          </>
        ) : (
          <div className="notice">
            <Boxes size={16} />
            <div>
              <div className="notice-title">No loader required</div>
              Bedrock has no official mod API. OpenClient will use the installed Bedrock app and
              manage content packs, worlds and settings.
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ProfileEditorDialog({
  profile,
  open,
  showSnapshots,
  onClose,
  onSaved,
}: {
  profile: Profile;
  open: boolean;
  showSnapshots: boolean;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
}) {
  const [tab, setTab] = useState<EditorTab>("general");
  const [name, setName] = useState(profile.name);
  const [gameVersion, setGameVersion] = useState(
    profile.edition === "java" ? profile.gameVersion : "",
  );
  const [loader, setLoader] = useState<LoaderType>(
    profile.edition === "java" ? profile.loader : "vanilla",
  );
  const [loaderVersion, setLoaderVersion] = useState(
    profile.edition === "java" ? profile.loaderVersion ?? "" : "",
  );
  const [loaderVersionId, setLoaderVersionId] = useState(
    profile.edition === "java" ? profile.loaderVersionId ?? "" : "",
  );
  const [memoryMb, setMemoryMb] = useState(
    profile.edition === "java" ? profile.memoryMb : 4096,
  );
  const [jvmPreset, setJvmPreset] = useState(
    profile.edition === "java" ? profile.jvmPreset : "g1-balanced",
  );
  const [customArgs, setCustomArgs] = useState(
    profile.edition === "java" ? profile.customJvmArgs.join(" ") : "",
  );
  const [gameDir, setGameDir] = useState(profile.gameDir);
  const [javaPath, setJavaPath] = useState(
    profile.edition === "java" ? profile.javaPath ?? "" : "",
  );
  const [versions, setVersions] = useState<MojangVersionSummary[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderLoading, setLoaderLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [systemMemory, setSystemMemory] = useState<number | null>(null);

  useEffect(() => {
    void window.openclient.app
      .systemMemory()
      .then((result) => {
        if (result.ok) setSystemMemory(result.data.totalMb);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (profile.edition !== "java") return;
    let cancelled = false;
    void window.openclient.java
      .versions(showSnapshots)
      .then((result) => {
        if (!cancelled && result.ok) setVersions(result.data);
      })
      .catch(() => setVersions([]));
    return () => {
      cancelled = true;
    };
  }, [profile.edition, showSnapshots]);

  useEffect(() => {
    if (profile.edition !== "java" || loader === "vanilla" || !gameVersion) {
      setLoaderVersions([]);
      return;
    }
    let cancelled = false;
    setLoaderLoading(true);
    void window.openclient.java
      .loaderVersions(loader as "fabric" | "quilt" | "forge" | "neoforge", gameVersion)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setLoaderVersions(result.data);
          setLoaderVersion((current) =>
            current && result.data.includes(current) ? current : result.data[0] ?? "",
          );
        } else {
          setLoaderVersions([]);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaderVersions([]);
      })
      .finally(() => {
        if (!cancelled) setLoaderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.edition, loader, gameVersion]);

  const versionOptions = useMemo(() => {
    const options: { value: string; label: string; description?: string }[] = versions.map(
      (version) => ({
        value: version.id,
        label: version.id,
        description: version.type,
      }),
    );
    if (gameVersion && !options.some((option) => option.value === gameVersion)) {
      options.unshift({ value: gameVersion, label: gameVersion, description: "Current build" });
    }
    return options;
  }, [versions, gameVersion]);

  const recommended = systemMemory ? recommendMemoryMb(systemMemory) : 4096;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const patch =
        profile.edition === "java"
          ? {
              name,
              gameVersion,
              loader,
              loaderVersion: loader === "vanilla" ? "" : loaderVersion,
              loaderVersionId: loader === "vanilla" ? "" : loaderVersionId,
              memoryMb,
              jvmPreset,
              customJvmArgs: parseExtraJvmArgs(customArgs),
              gameDir,
              javaPath: javaPath || "",
            }
          : { name, gameDir };
      const updated = await unwrap(
        window.openclient.profiles.update(profile.id, patch as never),
      );
      appStore.toast("Profile saved", "success", updated.name);
      onSaved(updated);
    } catch (error) {
      appStore.toast("Could not save profile", "error", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const installLoader = async (): Promise<void> => {
    if (profile.edition !== "java") return;
    setInstalling(true);
    try {
      if (gameVersion !== profile.gameVersion || loader !== profile.loader) {
        await unwrap(
          window.openclient.profiles.update(profile.id, {
            gameVersion,
            loader,
            loaderVersion: "",
            loaderVersionId: "",
          }),
        );
      }
      await unwrap(
        window.openclient.java.installLoader(
          profile.id,
          loader as "fabric" | "quilt" | "forge" | "neoforge",
          loaderVersion || undefined,
        ),
      );
      await appStore.refreshProfiles();
      appStore.toast("Loader installed", "success", `${loaderLabel(loader)} ${loaderVersion}`);
    } catch (error) {
      appStore.toast("Loader installation failed", "error", errorMessage(error));
    } finally {
      setInstalling(false);
    }
  };

  const repair = async (): Promise<void> => {
    if (profile.edition !== "java") return;
    setRepairing(true);
    try {
      await unwrap(window.openclient.java.repair(profile.id));
      appStore.toast("Profile repaired", "success", "Missing or corrupt files were downloaded again.");
    } catch (error) {
      appStore.toast("Repair failed", "error", errorMessage(error));
    } finally {
      setRepairing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${profile.name}`}
      description={
        profile.edition === "java"
          ? `${profile.gameVersion} · ${loaderLabel(profile.loader)} · ${profile.gameDir}`
          : "Bedrock Edition profile"
      }
      width="wide"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <span className="spacer" />
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save changes
          </Button>
        </>
      }
    >
      {profile.edition === "java" ? (
        <Tabs<EditorTab>
          value={tab}
          onChange={setTab}
          ariaLabel="Profile editor sections"
          items={[
            { value: "general", label: "General" },
            { value: "runtime", label: "Performance" },
            { value: "files", label: "Files" },
            { value: "content", label: "Content", count: profile.mods.length + profile.resourcePacks.length + profile.shaderPacks.length },
          ]}
        />
      ) : null}
      <div className="mt-4">
        {profile.edition === "bedrock" ? (
          <div className="vstack" style={{ gap: 14 }}>
            <Field label="Profile name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Local working folder" hint="Bedrock content and worlds live in the shared com.mojang folder, not here.">
              <div className="hstack">
                <Input value={gameDir} onChange={(event) => setGameDir(event.target.value)} />
                <Button
                  variant="secondary"
                  icon={<FolderOpen size={15} />}
                  onClick={() => {
                    void window.openclient.app
                      .pickDirectory("Select a working folder", gameDir)
                      .then((result) => {
                        if (result.ok && result.data) setGameDir(result.data);
                      });
                  }}
                >
                  Browse
                </Button>
              </div>
            </Field>
            <div className="notice">
              <Boxes size={16} />
              <div>
                <div className="notice-title">Shared Bedrock data</div>
                Content packs, worlds and graphics options are managed from the Content, Worlds and
                Bedrock sections. This profile is a named launcher preset.
              </div>
            </div>
          </div>
        ) : tab === "general" ? (
          <div className="vstack" style={{ gap: 14 }}>
            <Field label="Profile name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <div className="form-grid">
              <Field label="Minecraft version" hint={versions.length > 0 ? `${versions.length} versions available` : "Loading manifest"}>
                <Select
                  value={gameVersion}
                  onChange={(value) => {
                    setGameVersion(value);
                    setLoaderVersionId("");
                  }}
                  options={versionOptions}
                  ariaLabel="Minecraft version"
                  placeholder="Choose a version"
                />
              </Field>
              <Field label="Mod loader">
                <Select
                  value={loader}
                  onChange={(value) => {
                    setLoader(value as LoaderType);
                    setLoaderVersionId("");
                  }}
                  options={LOADER_OPTIONS}
                  ariaLabel="Mod loader"
                />
              </Field>
              {loader !== "vanilla" ? (
                <Field label={`${loaderLabel(loader)} version`} hint={installing ? "Installing, watch the progress bar." : "One click installs the loader profile and libraries."}>
                  <div className="hstack">
                    <div className="grow">
                      <Select
                        value={loaderVersion}
                        onChange={(value) => {
                          setLoaderVersion(value);
                          setLoaderVersionId("");
                        }}
                        options={loaderVersions.map((version) => ({
                          value: version,
                          label: version,
                        }))}
                        placeholder={loaderLoading ? "Loading builds" : "No builds"}
                        disabled={loaderLoading || loaderVersions.length === 0}
                        ariaLabel="Loader version"
                      />
                    </div>
                    <Button
                      variant="primary"
                      icon={<RefreshCw size={14} />}
                      loading={installing}
                      disabled={!loaderVersion}
                      onClick={() => void installLoader()}
                    >
                      Install
                    </Button>
                  </div>
                </Field>
              ) : null}
              <Field label="Java executable" optional hint="Leave empty to detect or download the correct runtime.">
                <div className="hstack">
                  <Input
                    value={javaPath}
                    onChange={(event) => setJavaPath(event.target.value)}
                    placeholder="Automatic"
                    mono
                  />
                  <Button
                    variant="secondary"
                    icon={<FolderOpen size={15} />}
                    onClick={() => {
                      void window.openclient.app
                        .pickFile("Select java executable", [
                          { name: "Java executable", extensions: ["exe", ""] },
                        ])
                        .then((result) => {
                          if (result.ok && result.data) setJavaPath(result.data);
                        });
                    }}
                  >
                    Browse
                  </Button>
                </div>
              </Field>
            </div>
            <div className="notice">
              <ShieldCheck size={16} />
              <div>
                <div className="notice-title">Checks before launch</div>
                OpenClient verifies every Mojang library and asset hash, installs the exact Java
                major version, builds the classpath with per-OS rules and refreshes the Microsoft
                session silently.
              </div>
            </div>
          </div>
        ) : tab === "runtime" ? (
          <div className="vstack" style={{ gap: 16 }}>
            <div className="setting-row" style={{ padding: 0, border: 0 }}>
              <div className="setting-info">
                <div className="setting-name">Memory allocation</div>
                <div className="setting-hint">
                  Recommended for this system: {recommended} MB. More memory is not always faster;
                  leave headroom for the operating system.
                </div>
              </div>
              <div className="setting-control" style={{ width: 240 }}>
                <Range
                  value={memoryMb}
                  min={1024}
                  max={16384}
                  step={512}
                  onChange={setMemoryMb}
                  label="Memory in megabytes"
                />
                <span className="mono" style={{ width: 64, textAlign: "right", fontSize: 12 }}>
                  {memoryMb} MB
                </span>
              </div>
            </div>
            <Field label="JVM preset" hint={JVM_PRESETS.find((preset) => preset.id === jvmPreset)?.description}>
              <Select
                value={jvmPreset}
                onChange={(value) => setJvmPreset(value as typeof jvmPreset)}
                options={JVM_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: preset.name,
                  description: preset.recommendedFor,
                }))}
                ariaLabel="JVM preset"
              />
            </Field>
            {jvmPreset === "custom" ? (
              <Field label="Custom JVM arguments" hint="One or more arguments separated by spaces. Quotes are respected.">
                <textarea
                  className="textarea textarea-mono"
                  value={customArgs}
                  onChange={(event) => setCustomArgs(event.target.value)}
                  placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=120"
                  rows={4}
                />
              </Field>
            ) : null}
            <div className="notice">
              <Wrench size={16} />
              <div>
                <div className="notice-title">Managed runtime</div>
                Java {requiredJavaMajor(gameVersion)} is selected automatically for this Minecraft
                version. If it is missing, OpenClient downloads a Temurin runtime and verifies the
                archive checksum.
              </div>
            </div>
          </div>
        ) : tab === "files" ? (
          <div className="vstack" style={{ gap: 16 }}>
            <Field label="Game directory" hint="Mods, resource packs, shader packs, saves, logs, crash reports and options.txt live here.">
              <div className="hstack">
                <Input value={gameDir} onChange={(event) => setGameDir(event.target.value)} mono />
                <Button
                  variant="secondary"
                  icon={<FolderOpen size={15} />}
                  onClick={() => {
                    void window.openclient.app
                      .pickDirectory("Select game directory", gameDir)
                      .then((result) => {
                        if (result.ok && result.data) setGameDir(result.data);
                      });
                  }}
                >
                  Browse
                </Button>
              </div>
            </Field>
            <div className="hstack wrap">
              <Button
                variant="secondary"
                icon={<FolderOpen size={15} />}
                onClick={() => void window.openclient.app.openPath(gameDir).then(() => undefined).catch((error) => appStore.toast("Could not open folder", "error", errorMessage(error)))}
              >
                Open folder
              </Button>
              <Button
                variant="secondary"
                icon={<Wrench size={15} />}
                loading={repairing}
                onClick={() => void repair()}
              >
                Repair profile
              </Button>
            </div>
            <div className="panel-fill" style={{ padding: 14 }}>
              <div className="stat-label">Disk usage</div>
              <div className="field-hint" style={{ marginTop: 5 }}>
                {profile.mods.length + profile.resourcePacks.length + profile.shaderPacks.length} managed
                files · {formatBytes(
                  [...profile.mods, ...profile.resourcePacks, ...profile.shaderPacks].reduce(
                    (sum, entry) => sum + entry.sizeBytes,
                    0,
                  ),
                )} installed content
              </div>
            </div>
          </div>
        ) : (
          <div className="vstack" style={{ gap: 14 }}>
            <SectionHeader
              title="Installed content"
              description="Manage mods and packs from their dedicated screens."
            />
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Mods</span>
                <span className="stat-value">{profile.mods.length}</span>
                <Button variant="ghost" size="xs" onClick={() => appStore.navigate("mods")}>
                  Manage mods
                </Button>
              </div>
              <div className="stat-card">
                <span className="stat-label">Resource packs</span>
                <span className="stat-value">{profile.resourcePacks.length}</span>
                <Button variant="ghost" size="xs" onClick={() => appStore.navigate("packs")}>
                  Manage packs
                </Button>
              </div>
              <div className="stat-card">
                <span className="stat-label">Shader packs</span>
                <span className="stat-value">{profile.shaderPacks.length}</span>
                <Button variant="ghost" size="xs" onClick={() => appStore.navigate("packs")}>
                  Manage shaders
                </Button>
              </div>
              <div className="stat-card">
                <span className="stat-label">Performance profile</span>
                <span className="stat-value">
                  {profile.performancePreset ?? "Custom"}
                </span>
                <Button variant="ghost" size="xs" onClick={() => appStore.navigate("mods")}>
                  Tune
                </Button>
              </div>
            </div>
            <div className="notice">
              <Coffee size={16} />
              <div>
                <div className="notice-title">Edition lock</div>
                This profile is a Java Edition instance. Bedrock content packs are managed from the
                Bedrock section after switching edition.
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

