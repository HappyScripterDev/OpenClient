import { useState } from "react";
import { Layers3, Palette, Sparkles } from "lucide-react";
import { appStore, useAppState } from "../lib/store";
import { Button } from "../ui/Button";
import { EmptyState, PageHeader } from "../ui/Feedback";
import { Segmented } from "../ui/Tabs";
import { CatalogBrowser } from "./CatalogBrowser";

type PackKind = "resourcepack" | "shader";

export function PacksScreen() {
  const { profiles, selectedProfileId } = useAppState();
  const profile = profiles.find(
    (entry) => entry.id === selectedProfileId && entry.edition === "java",
  );
  const [kind, setKind] = useState<PackKind>("resourcepack");
  if (!profile || profile.edition !== "java") {
    return (
      <div className="screen">
        <PageHeader
          eyebrow="Java Edition"
          title="Resource Packs & Shaders"
          subtitle="Browse and manage visual content per profile."
        />
        <EmptyState
          icon={<Palette size={24} />}
          title="No Java profile selected"
          text="Packs belong to a Java profile. Create or select one first."
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
        title="Resource Packs & Shaders"
        subtitle={`${profile.name} · ${profile.gameVersion} · ${profile.loader === "vanilla" ? "Vanilla" : profile.loader}. Installed files go to resourcepacks and shaderpacks.`}
        actions={
          <Segmented
            value={kind}
            onChange={setKind}
            ariaLabel="Pack type"
            options={[
              { value: "resourcepack", label: "Resource packs", icon: <Layers3 size={14} /> },
              { value: "shader", label: "Shaders", icon: <Sparkles size={14} /> },
            ]}
          />
        }
      />
      <div className="notice" style={{ marginBottom: 16 }}>
        <Palette size={16} />
        <div>
          <div className="notice-title">
            {kind === "shader" ? "Shaders need a compatible renderer" : "Resource packs load from the profile folder"}
          </div>
          {kind === "shader"
            ? "Install Iris (Fabric/Quilt) or a supported shader loader first. OpenClient installs the pack file; the renderer loads it."
            : "Enabled packs are selected in Minecraft's own resource pack screen. OpenClient manages the files and metadata."}
        </div>
      </div>
      <CatalogBrowser
        key={kind}
        kind={kind}
        title={kind === "shader" ? "Shaders" : "Resource Packs"}
        eyebrow="Java Edition"
        subtitle="Browse and install"
        embedded
      />
    </div>
  );
}
