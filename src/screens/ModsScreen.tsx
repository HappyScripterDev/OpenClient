import { Boxes, Package, Settings2 } from "lucide-react";
import { appStore, useAppState } from "../lib/store";
import { loaderLabel } from "../lib/format";
import { Button } from "../ui/Button";
import { EmptyState, PageHeader } from "../ui/Feedback";
import { CatalogBrowser } from "./CatalogBrowser";
import { PerformancePanel } from "./PerformancePanel";

export function ModsScreen() {
  const { profiles, selectedProfileId } = useAppState();
  const profile = profiles.find(
    (entry) => entry.id === selectedProfileId && entry.edition === "java",
  );
  if (!profile || profile.edition !== "java") {
    return (
      <div className="screen">
        <PageHeader
          eyebrow="Java Edition"
          title="Mods & Performance"
          subtitle="Install and manage mods per profile, with dependency resolution and hash verification."
        />
        <EmptyState
          icon={<Package size={24} />}
          title="No Java profile selected"
          text="Mods belong to a Java profile. Create one to install Fabric, Quilt, Forge or NeoForge content."
          action={
            <Button variant="primary" onClick={() => appStore.navigate("profiles")}>
              Create a profile
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className="screen">
      <PageHeader
        eyebrow="Java Edition"
        title="Mods & Performance"
        subtitle={`${profile.name} · Minecraft ${profile.gameVersion} · ${loaderLabel(profile.loader)}. Modrinth is the default catalog; CurseForge is optional.`}
        actions={
          <Button
            variant="secondary"
            icon={<Settings2 size={15} />}
            onClick={() => appStore.navigate("profiles")}
          >
            Profile settings
          </Button>
        }
      />
      <PerformancePanel profile={profile} />
      <section className="section" aria-labelledby="mod-catalog-heading">
        <div className="section-header">
          <div>
            <h2 className="section-heading" id="mod-catalog-heading">
              Mod catalog
            </h2>
            <p className="section-desc">
              Only versions compatible with {profile.gameVersion} and {loaderLabel(profile.loader)} are offered.
              Authors and licenses are shown before installation.
            </p>
          </div>
          <div className="section-actions">
            <span className="badge badge-muted">
              <Boxes size={12} /> {profile.mods.length} installed
            </span>
          </div>
        </div>
        <CatalogBrowser
          kind="mod"
          title="Mods"
          eyebrow="Java Edition"
          subtitle="Browse and install mods"
          embedded
        />
      </section>
    </div>
  );
}
