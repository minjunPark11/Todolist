// ModelRecommender (LOCAL_AI_SYSTEM_DESIGN.md §5): pure function from a
// hardware profile to a recommendation, so it can be unit-tested without any
// Tauri runtime — pass an identity function as `t` in tests. RAM drives the
// pick; GPU/VRAM only adds guidance until GPU detection lands (profile.gpu is
// always null in Phase 0).
import { LOCAL_MODEL_CATALOG } from "./modelCatalog";
import type { HardwareProfile, LocalModelOption, ModelRecommendation, ModelTier, TranslateFn } from "./types";

// Extra free space (GB) required beyond the model file itself, covering the
// .partial download plus headroom so the user's disk isn't filled to the brim.
const DISK_HEADROOM_GB = 2;

function pickTier(totalRamGb: number | null): ModelTier {
  if (totalRamGb === null) return "light";
  if (totalRamGb <= 8) return "light";
  if (totalRamGb <= 16) return "recommended";
  return "highPerformance";
}

function byTier(catalog: LocalModelOption[], tier: ModelTier): LocalModelOption | undefined {
  return catalog.find((model) => model.recommendedTier === tier);
}

function buildReason(profile: HardwareProfile, primary: LocalModelOption, t: TranslateFn): string {
  if (profile.totalRamGb === null) {
    return t("localAi.reason.unknownRam", { model: primary.displayName });
  }
  const vars = { ram: Math.round(profile.totalRamGb), model: primary.displayName };
  switch (primary.recommendedTier) {
    case "light":
      return t("localAi.reason.light", vars);
    case "highPerformance":
      return t("localAi.reason.high", vars);
    default:
      return t("localAi.reason.balanced", vars);
  }
}

export function recommendLocalModel(
  profile: HardwareProfile,
  t: TranslateFn,
  catalog: LocalModelOption[] = LOCAL_MODEL_CATALOG,
): ModelRecommendation {
  const warnings: string[] = [];
  const tier = pickTier(profile.totalRamGb);
  const primary = byTier(catalog, tier) ?? catalog[0];
  if (!primary) {
    throw new Error("Local model catalog is empty.");
  }

  if (profile.totalRamGb === null) {
    warnings.push(t("localAi.warning.unknownRam"));
  }

  if (
    profile.availableDiskGb !== null &&
    profile.availableDiskGb < primary.estimatedSizeGb + DISK_HEADROOM_GB
  ) {
    warnings.push(
      t("localAi.warning.lowDisk", {
        size: primary.estimatedSizeGb,
        free: profile.availableDiskGb.toFixed(1),
      }),
    );
  }

  // VRAM guidance (design §5). profile.gpu stays null until GPU detection
  // ships, so these branches are inert in Phase 0 but the thresholds are the
  // contract the detector must feed.
  const vramGb = profile.gpu?.vramGb ?? null;
  if (vramGb !== null && vramGb >= 12) {
    warnings.push(t("localAi.warning.vram12"));
  } else if (vramGb !== null && vramGb >= 6) {
    warnings.push(t("localAi.warning.vram6"));
  }

  // "더 가벼운 / 추천 / 고급" choices: everything except the primary, ordered
  // lighter-first so the UI can render them as-is.
  const alternatives = catalog
    .filter((model) => model.id !== primary.id)
    .sort((a, b) => a.estimatedSizeGb - b.estimatedSizeGb);

  return {
    primary,
    alternatives,
    reason: buildReason(profile, primary, t),
    warnings,
  };
}
