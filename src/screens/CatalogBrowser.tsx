import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FolderOpen,
  Package,
  RefreshCw,
  SearchX,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type {
  CatalogProject,
  CatalogVersion,
  ContentKind,
  InstalledContent,
  InstallPlan,
  Profile,
} from "../shared/types";
import { appStore, useAppState } from "../lib/store";
import {
  errorMessage,
  formatBytes,
  formatDate,
  formatNumber,
  loaderLabel,
  unwrap,
  classNames,
} from "../lib/format";
import { Button, IconButton } from "../ui/Button";
import { SearchInput } from "../ui/Field";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Controls";
import { Badge, SectionHeader } from "../ui/Panel";
import { EmptyState, PageHeader, ProjectSkeletonGrid, Skeleton } from "../ui/Feedback";
import { Dialog } from "../ui/Dialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "downloads", label: "Downloads" },
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Newest" },
];

function installedFor(profile: Profile | undefined, kind: ContentKind): InstalledContent[] {
  if (!profile || profile.edition !== "java") return [];
  if (kind === "mod") return profile.mods;
  if (kind === "resourcepack") return profile.resourcePacks;
  return profile.shaderPacks;
}

export function CatalogBrowser({
  kind,
  title,
  eyebrow,
  subtitle,
  embedded = false,
}: {
  kind: ContentKind;
  title: string;
  eyebrow: string;
  subtitle: string;
  embedded?: boolean;
}) {
  const state = useAppState();
  const { profiles, selectedProfileId, settings } = state;
  const profile = profiles.find(
    (entry) => entry.id === selectedProfileId && entry.edition === "java",
  ) as Profile | undefined;
  const javaProfile = profile?.edition === "java" ? profile : undefined;
  const [tab, setTab] = useState<"browse" | "installed">("browse");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"modrinth" | "curseforge">("modrinth");
  const [sort, setSort] = useState("relevance");
  const [projects, setProjects] = useState<CatalogProject[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<CatalogProject | null>(null);
  const [detailVersions, setDetailVersions] = useState<CatalogVersion[]>([]);
  const [detailPlan, setDetailPlan] = useState<InstallPlan | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<InstalledContent | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const installed = useMemo(() => installedFor(javaProfile, kind), [javaProfile, kind]);

  const runSearch = useCallback(
    async (reset: boolean) => {
      if (!javaProfile) return;
      const nextOffset = reset ? 0 : offset;
      if (reset) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }
      try {
        const result = await unwrap(
          window.openclient.catalog.search({
            query,
            kind,
            gameVersion: javaProfile.gameVersion,
            loader: javaProfile.loader === "vanilla" ? undefined : javaProfile.loader,
            source,
            sort: sort as "relevance" | "downloads" | "updated" | "newest",
            offset: nextOffset,
            limit: 20,
          }),
        );
        setProjects((current) => (reset ? result.projects : [...current, ...result.projects]));
        setTotal(result.total);
        setOffset(nextOffset + result.projects.length);
      } catch (error) {
        appStore.toast("Catalog unavailable", "error", errorMessage(error));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [javaProfile, query, kind, source, sort, offset],
  );

  useEffect(() => {
    if (!javaProfile) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void runSearch(true);
    }, 320);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [javaProfile?.id, javaProfile?.gameVersion, javaProfile?.loader, query, source, sort, kind]);

  const openDetail = useCallback(
    async (project: CatalogProject) => {
      setSelected(project);
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailVersions([]);
      setDetailPlan(null);
      if (!javaProfile) return;
      try {
        const [versions, plan] = await Promise.all([
          unwrap(
            window.openclient.catalog.versions(
              source,
              project.id,
              javaProfile.gameVersion,
              javaProfile.loader === "vanilla" ? "" : javaProfile.loader,
              kind,
            ),
          ),
          unwrap(
            window.openclient.catalog.plan(
              javaProfile.id,
              source,
              project.id,
              kind,
            ),
          ).catch(() => null),
        ]);
        setDetailVersions(versions);
        setDetailPlan(plan);
      } catch (error) {
        appStore.toast("Version lookup failed", "error", errorMessage(error));
      } finally {
        setDetailLoading(false);
      }
    },
    [javaProfile, source, kind],
  );

  const installVersion = useCallback(
    async (version: CatalogVersion) => {
      if (!javaProfile) return;
      setInstallingId(version.id);
      try {
        await unwrap(
          window.openclient.catalog.install(
            javaProfile.id,
            source,
            version.id,
            kind,
          ),
        );
        await appStore.refreshProfiles();
        appStore.toast("Installed", "success", `${version.name || version.versionNumber} is ready.`);
      } catch (error) {
        appStore.toast("Install failed", "error", errorMessage(error));
      } finally {
        setInstallingId(null);
      }
    },
    [javaProfile, source, kind],
  );

  const checkUpdates = useCallback(async () => {
    if (!javaProfile) return;
    setUpdateBusy(true);
    try {
      const updates = await unwrap(window.openclient.content.checkUpdates(javaProfile.id));
      await appStore.refreshProfiles();
      appStore.toast(
        updates.length > 0 ? "Updates found" : "Everything is current",
        updates.length > 0 ? "info" : "success",
        updates.length > 0
          ? `${updates.length} installed item${updates.length === 1 ? "" : "s"} can be updated.`
          : "No newer compatible builds were found.",
      );
    } catch (error) {
      appStore.toast("Update check failed", "error", errorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  }, [javaProfile]);

  const updateOne = useCallback(
    async (content: InstalledContent) => {
      if (!javaProfile) return;
      try {
        await unwrap(window.openclient.content.update(javaProfile.id, content.id));
        await appStore.refreshProfiles();
        appStore.toast("Updated", "success", content.name);
      } catch (error) {
        appStore.toast("Update failed", "error", errorMessage(error));
      }
    },
    [javaProfile],
  );

  const toggleOne = useCallback(
    async (content: InstalledContent, enabled: boolean) => {
      if (!javaProfile) return;
      try {
        await unwrap(window.openclient.content.toggle(javaProfile.id, content.id, enabled));
        await appStore.refreshProfiles();
      } catch (error) {
        appStore.toast("Could not change state", "error", errorMessage(error));
      }
    },
    [javaProfile],
  );

  const removeOne = useCallback(async () => {
    if (!javaProfile || !removeTarget) return;
    setRemoveBusy(true);
    try {
      await unwrap(window.openclient.content.remove(javaProfile.id, removeTarget.id));
      await appStore.refreshProfiles();
      appStore.toast("Removed", "info", removeTarget.name);
      setRemoveTarget(null);
    } catch (error) {
      appStore.toast("Could not remove", "error", errorMessage(error));
    } finally {
      setRemoveBusy(false);
    }
  }, [javaProfile, removeTarget]);

  const importLocal = useCallback(async () => {
    if (!javaProfile) return;
    const paths = await unwrap(
      window.openclient.app.pickFiles(
        `Import ${kind === "mod" ? "mods" : "packs"}`,
        [
          {
            name: kind === "mod" ? "Minecraft mod" : "Minecraft pack",
            extensions: kind === "mod" ? ["jar"] : ["zip"],
          },
        ],
      ),
    );
    if (paths.length === 0) return;
    try {
      const items = await unwrap(
        window.openclient.content.importLocal(javaProfile.id, kind, paths),
      );
      await appStore.refreshProfiles();
      appStore.toast("Imported", "success", `${items.length} file${items.length === 1 ? "" : "s"} added.`);
    } catch (error) {
      appStore.toast("Import failed", "error", errorMessage(error));
    }
  }, [javaProfile, kind]);

  if (!javaProfile) {
    const empty = (
      <EmptyState
        icon={<Package size={24} />}
        title="Select a Java profile"
        text="Content is installed per profile. Create or select a Java profile first."
        action={
          <Button variant="primary" onClick={() => appStore.navigate("profiles")}>
            Go to profiles
          </Button>
        }
      />
    );
    return embedded ? (
      empty
    ) : (
      <div className="screen">
        <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        {empty}
      </div>
    );
  }

  const installedIds = new Set(installed.map((entry) => entry.projectId));
  const sourceOptions = [
    { value: "modrinth", label: "Modrinth" },
    ...(settings.curseforgeApiKey
      ? [{ value: "curseforge", label: "CurseForge" }]
      : []),
  ];

  return (
    <div className={embedded ? "catalog-embedded" : "screen"}>
      {!embedded ? (
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={`${subtitle} · ${javaProfile.name} · ${javaProfile.gameVersion} · ${loaderLabel(javaProfile.loader)}`}
          actions={
            <>
              <Button variant="ghost" icon={<FolderOpen size={15} />} onClick={() => void window.openclient.content.openFolder(javaProfile.id, kind).then(() => undefined).catch((error) => appStore.toast("Could not open folder", "error", errorMessage(error)))}>
                Open folder
              </Button>
              <Button variant="secondary" icon={<Upload size={15} />} onClick={() => void importLocal()}>
                Import
              </Button>
            </>
          }
        />
      ) : null}
      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Content view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "browse"}
            className={classNames("segment", tab === "browse" && "is-active")}
            onClick={() => setTab("browse")}
          >
            Browse
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "installed"}
            className={classNames("segment", tab === "installed" && "is-active")}
            onClick={() => setTab("installed")}
          >
            Installed {installed.length > 0 ? `(${installed.length})` : ""}
          </button>
        </div>
        {tab === "browse" ? (
          <>
            <div style={{ flex: 1, minWidth: 220 }}>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={`Search ${kind === "mod" ? "mods" : "packs"}`}
                dataGlobalSearch
              />
            </div>
            {sourceOptions.length > 1 ? (
              <div style={{ width: 140 }}>
                <Select
                  value={source}
                  onChange={(value) => setSource(value as "modrinth" | "curseforge")}
                  options={sourceOptions}
                  ariaLabel="Catalog source"
                />
              </div>
            ) : null}
            <div style={{ width: 170 }}>
              <Select
                value={sort}
                onChange={setSort}
                options={SORT_OPTIONS}
                ariaLabel="Sort results"
              />
            </div>
            {embedded ? (
              <div className="toolbar-group">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<FolderOpen size={14} />}
                  onClick={() =>
                    void window.openclient.content
                      .openFolder(javaProfile.id, kind)
                      .catch((error) => appStore.toast("Could not open folder", "error", errorMessage(error)))
                  }
                >
                  Folder
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Upload size={14} />}
                  onClick={() => void importLocal()}
                >
                  Import
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="toolbar-group">
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} />}
              loading={updateBusy}
              onClick={() => void checkUpdates()}
            >
              Check updates
            </Button>
          </div>
        )}
      </div>

      {tab === "browse" ? (
        <div className="catalog-layout">
          <div>
            {loading ? (
              <ProjectSkeletonGrid />
            ) : projects.length === 0 ? (
              <EmptyState
                icon={<SearchX size={24} />}
                title="No results"
                text="Try a different search, edition version or loader filter."
              />
            ) : (
              <>
                <div className="project-grid">
                  {projects.map((project) => {
                    const isInstalled = installedIds.has(project.id);
                    return (
                      <article className="project-card" key={`${project.source}:${project.id}`}>
                        <div className="project-head">
                          {project.iconUrl ? (
                            <img
                              className="project-icon"
                              src={project.iconUrl}
                              alt=""
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="project-icon-fallback">
                              <Package size={20} />
                            </div>
                          )}
                          <div className="grow">
                            <div className="project-title-row">
                              <h3 className="project-title">{project.name}</h3>
                              {isInstalled ? <Badge variant="success">Installed</Badge> : null}
                            </div>
                            <p className="project-author">
                              by {project.author || "Unknown"} · {formatNumber(project.downloads)} downloads
                            </p>
                          </div>
                        </div>
                        <p className="project-summary">{project.summary}</p>
                        <div className="project-meta">
                          <span>{project.license}</span>
                          <span>·</span>
                          <span>Updated {formatDate(project.updatedAt)}</span>
                        </div>
                        <div className="project-actions">
                          <Button variant="primary" size="sm" onClick={() => void openDetail(project)}>
                            View versions
                          </Button>
                          {project.externalUrl ? (
                            <IconButton
                              label="Open project page"
                              size="sm"
                              onClick={() => void window.openclient.app.openExternal(project.externalUrl as string)}
                            >
                              <ExternalLink size={15} />
                            </IconButton>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {projects.length < total ? (
                  <div className="mt-4" style={{ display: "flex", justifyContent: "center" }}>
                    <Button
                      variant="secondary"
                      loading={loadingMore}
                      onClick={() => void runSearch(false)}
                    >
                      Load more
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <aside className="detail-pane">
            {selected ? (
              <DetailCard
                project={selected}
                versions={detailVersions}
                plan={detailPlan}
                loading={detailLoading}
                installed={installed}
                installingId={installingId}
                onInstall={(version) => void installVersion(version)}
                onClose={() => setSelected(null)}
                onOpenProject={() =>
                  selected.externalUrl
                    ? void window.openclient.app.openExternal(selected.externalUrl)
                    : undefined
                }
              />
            ) : (
              <div className="detail-card">
                <div className="empty" style={{ padding: "34px 12px" }}>
                  <div className="empty-icon">
                    <Download size={22} />
                  </div>
                  <div className="empty-title">Pick a project</div>
                  <p className="empty-text">
                    Select a card to see compatible versions, dependencies and license.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <InstalledList
          kind={kind}
          items={installed}
          onToggle={toggleOne}
          onUpdate={updateOne}
          onRemove={setRemoveTarget}
        />
      )}

      <Dialog
        open={detailOpen && selected !== null && window.innerWidth < 980}
        onClose={() => setDetailOpen(false)}
        title={selected?.name ?? "Project"}
        description={selected?.summary}
        width="wide"
      >
        {selected ? (
          <DetailCard
            project={selected}
            versions={detailVersions}
            plan={detailPlan}
            loading={detailLoading}
            installed={installed}
            installingId={installingId}
            onInstall={(version) => void installVersion(version)}
            onClose={() => setDetailOpen(false)}
            onOpenProject={() =>
              selected.externalUrl
                ? void window.openclient.app.openExternal(selected.externalUrl)
                : undefined
            }
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.name ?? "content"}`}
        description="The file is deleted from the selected profile. This cannot be undone."
        confirmLabel="Remove"
        danger
        busy={removeBusy}
        onConfirm={() => void removeOne()}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}

function DetailCard({
  project,
  versions,
  plan,
  loading,
  installed,
  installingId,
  onInstall,
  onClose,
  onOpenProject,
}: {
  project: CatalogProject;
  versions: CatalogVersion[];
  plan: InstallPlan | null;
  loading: boolean;
  installed: InstalledContent[];
  installingId: string | null;
  onInstall: (version: CatalogVersion) => void;
  onClose: () => void;
  onOpenProject: () => void;
}) {
  const current = installed.find((entry) => entry.projectId === project.id);
  return (
    <div className="detail-card">
      <div className="spread">
        <div className="hstack">
          {project.iconUrl ? (
            <img className="project-icon" src={project.iconUrl} alt="" />
          ) : (
            <div className="project-icon-fallback">
              <Package size={20} />
            </div>
          )}
          <div>
            <h3 className="detail-title">{project.name}</h3>
            <p className="detail-sub">by {project.author}</p>
          </div>
        </div>
        <IconButton label="Close details" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <p className="detail-text">{project.summary}</p>
      <div className="meta-grid">
        <div className="meta-item">
          <div className="meta-key">License</div>
          <div className="meta-value" title={project.license}>{project.license}</div>
        </div>
        <div className="meta-item">
          <div className="meta-key">Downloads</div>
          <div className="meta-value">{formatNumber(project.downloads)}</div>
        </div>
        <div className="meta-item">
          <div className="meta-key">Updated</div>
          <div className="meta-value">{formatDate(project.updatedAt)}</div>
        </div>
        <div className="meta-item">
          <div className="meta-key">Source</div>
          <div className="meta-value">{project.source === "modrinth" ? "Modrinth" : "CurseForge"}</div>
        </div>
      </div>
      {plan ? (
        <div className="notice is-info" style={{ marginTop: 12 }}>
          <ShieldCheck size={16} />
          <div>
            <div className="notice-title">Dependency plan</div>
            {plan.entries.length - 1} required dependenc{plan.entries.length - 1 === 1 ? "y" : "ies"} will be installed automatically. Hashes are verified before files are used.
          </div>
        </div>
      ) : null}
      {current ? (
        <div className="notice" style={{ marginTop: 12 }}>
          <div>
            <div className="notice-title">Installed version</div>
            {current.versionNumber} · {formatBytes(current.sizeBytes)}
            {current.updateVersionNumber ? ` · Update ${current.updateVersionNumber} available` : ""}
          </div>
        </div>
      ) : null}
      <hr className="divider" />
      <SectionHeader title="Versions" description="Only builds matching this profile are shown." />
      {loading ? (
        <div className="vstack">
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      ) : versions.length === 0 ? (
        <p className="field-hint">No compatible version was found for this profile.</p>
      ) : (
        <div className="vstack">
          {versions.slice(0, 20).map((version) => {
            const isInstalled = current?.versionId === version.id;
            const unavailable = !version.downloadUrl;
            return (
              <div className="version-row" key={version.id}>
                <div className="version-main">
                  <div className="version-name">{version.versionNumber || version.name}</div>
                  <div className="version-meta">
                    {version.gameVersions.slice(0, 3).join(", ")}
                    {version.loaders.length > 0 ? ` · ${version.loaders.join(", ")}` : ""}
                    {version.size ? ` · ${formatBytes(version.size)}` : ""}
                  </div>
                </div>
                {isInstalled ? (
                  <span className="installed-marker">Installed</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={unavailable}
                    loading={installingId === version.id}
                    title={unavailable ? "The author disabled third-party downloads" : undefined}
                    onClick={() => onInstall(version)}
                  >
                    {unavailable ? "Unavailable" : "Install"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="hstack mt-3">
        <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={onOpenProject}>
          Project page
        </Button>
      </div>
      <div className="field-hint mt-1">
        Compatibility is checked against the selected profile. OpenClient downloads from the official
        {project.source === "modrinth" ? " Modrinth" : " CurseForge"} API and never bundles third-party files.
      </div>
    </div>
  );
}

function InstalledList({
  kind,
  items,
  onToggle,
  onUpdate,
  onRemove,
}: {
  kind: ContentKind;
  items: InstalledContent[];
  onToggle: (content: InstalledContent, enabled: boolean) => void;
  onUpdate: (content: InstalledContent) => void;
  onRemove: (content: InstalledContent) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Package size={24} />}
        title={`No ${kind === "mod" ? "mods" : "packs"} installed`}
        text="Browse the catalog or import a file from your disk. Every installed item shows its author and license."
      />
    );
  }
  return (
    <div className="list">
      {items.map((content) => (
        <div className="list-row" key={content.id}>
          <div className="row-art" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package size={17} />
          </div>
          <div className="row-main">
            <div className="row-title">{content.name}</div>
            <div className="row-sub">
              <span>{content.author}</span>
              <span>·</span>
              <span>{content.license}</span>
              <span>·</span>
              <span>{content.versionNumber}</span>
              {content.updateVersionNumber ? (
                <>
                  <span>·</span>
                  <Badge variant="warning">Update {content.updateVersionNumber}</Badge>
                </>
              ) : null}
            </div>
          </div>
          <div className="row-actions">
            {content.updateVersionId ? (
              <Button variant="secondary" size="xs" onClick={() => onUpdate(content)}>
                Update
              </Button>
            ) : null}
            <Switch
              checked={content.enabled}
              onChange={(checked) => onToggle(content, checked)}
              label={`${content.enabled ? "Disable" : "Enable"} ${content.name}`}
            />
            <IconButton label={`Remove ${content.name}`} size="sm" onClick={() => onRemove(content)}>
              <X size={14} />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  );
}
