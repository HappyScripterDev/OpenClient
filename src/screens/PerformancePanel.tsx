import { useState } from "react";
import { Gauge, RotateCcw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { PERFORMANCE_PRESETS, presetSupportsVersion } from "../shared/performance-presets";
import type { JavaProfile, PerformancePresetId } from "../shared/types";
import { appStore } from "../lib/store";
import { errorMessage, unwrap, loaderLabel } from "../lib/format";
import { Button } from "../ui/Button";
import { Badge, SectionHeader } from "../ui/Panel";
import { ConfirmDialog } from "../ui/ConfirmDialog";

const PRESET_ICONS: Record<string, typeof Zap> = {
  ultra: Zap,
  balanced: Gauge,
  quality: Sparkles,
};

export function PerformancePanel({ profile }: { profile: JavaProfile }) {
  const [pending, setPending] = useState<PerformancePresetId | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const preset = PERFORMANCE_PRESETS.find((entry) => entry.id === pending);

  const apply = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await unwrap(
        window.openclient.performance.apply(profile.id, pending),
      );
      await appStore.refreshProfiles();
      const summary = `${result.installed.length} installed, ${result.skipped.length} skipped, ${result.failed.length} failed.`;
      appStore.toast(
        "Performance profile applied",
        result.failed.length > 0 ? "warning" : "success",
        summary,
      );
      if (result.optionsBackupPath) {
        appStore.toast(
          "options.txt tuned",
          "info",
          "A backup of your previous graphics settings was created.",
        );
      }
      setPending(null);
    } catch (error) {
      appStore.toast("Could not apply profile", "error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (): Promise<void> => {
    setRestoreBusy(true);
    try {
      await unwrap(window.openclient.performance.restoreOptions(profile.id));
      appStore.toast("Graphics settings restored", "success", "options.txt was restored from the backup.");
    } catch (error) {
      appStore.toast("No backup available", "warning", errorMessage(error));
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <section className="section" aria-labelledby="performance-heading">
      <SectionHeader
        id="performance-heading"
        title="Performance profiles"
        description={`Curated, version-aware mod sets for ${profile.gameVersion} on ${loaderLabel(profile.loader)}. Mods are resolved from Modrinth at install time.`}
        actions={
          profile.performancePreset ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              loading={restoreBusy}
              onClick={() => void restore()}
            >
              Restore options
            </Button>
          ) : null
        }
      />
      <div className="preset-grid">
        {PERFORMANCE_PRESETS.map((entry) => {
          const Icon = PRESET_ICONS[entry.id] ?? Gauge;
          const supported = presetSupportsVersion(entry, profile.gameVersion);
          const active = profile.performancePreset === entry.id;
          return (
            <button
              type="button"
              key={entry.id}
              className={`preset-card${active ? " is-active" : ""}`}
              disabled={!supported}
              onClick={() => setPending(entry.id)}
              title={supported ? undefined : `Requires Minecraft ${entry.minGameVersion} or newer`}
            >
              <div className="spread">
                <div className="hstack">
                  <Icon size={18} className={active ? "text-accent" : "text-muted"} />
                  <span className="preset-name">{entry.name}</span>
                </div>
                {active ? <Badge variant="accent">Active</Badge> : null}
              </div>
              <span className="preset-tagline">{entry.tagline}</span>
              <span className="preset-desc">{entry.description}</span>
              <span className="preset-mods">
                {entry.mods.length} mods · JVM {entry.jvmPreset.replace("g1-", "G1 ")}
              </span>
              {!supported ? (
                <span className="field-error">Needs {entry.minGameVersion} or newer</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={`Apply ${preset?.name ?? "performance profile"}`}
        description={
          preset
            ? `${preset.description} ${profile.loader === "vanilla" ? "Fabric will be installed first because mods require a loader." : ""}`
            : undefined
        }
        confirmLabel="Apply profile"
        busy={busy}
        onConfirm={() => void apply()}
        onClose={() => setPending(null)}
      >
        {preset ? (
          <div className="vstack">
            <div className="notice is-info">
              <ShieldCheck size={16} />
              <div>
                <div className="notice-title">What will change</div>
                Mods are checked against {profile.gameVersion} and {loaderLabel(profile.loader)}.
                Unavailable mods are skipped. Existing mods stay installed. options.txt is
                backed up before tuning.
              </div>
            </div>
            <div className="chip-row">
              {preset.mods.map((mod) => (
                <span className="chip" key={mod.slug}>
                  {mod.slug}
                  {mod.optional ? " (optional)" : ""}
                </span>
              ))}
            </div>
            <div className="field-hint">
              Charts, shader support and the final in-game frame rate depend on your hardware.
              No mod gives an unfair gameplay advantage.
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
