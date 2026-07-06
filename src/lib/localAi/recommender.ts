// ModelRecommender (LOCAL_AI_SYSTEM_DESIGN.md §5): pure function from a
// hardware profile to a recommendation, so it can be unit-tested without any
// Tauri runtime — pass an identity function as `t` in tests. The pick is
// driven by whichever of RAM or GPU VRAM supports the larger model: a big GPU
// can run a bigger model fast on-device, while plenty of RAM can still run it
// (slower) on the CPU. VRAM only upgrades the pick, never lowers it, and falls
// back to RAM when no GPU is detected (profile.gpu is null for non-NVIDIA GPUs
// until a cross-platform detector lands).
import { LOCAL_MODEL_CATALOG } from "./modelCatalog";
import type { HardwareProfile, LocalModelOption, ModelRecommendation, ModelTier, TranslateFn } from "./types";

// Extra free space (GB) required beyond the model file itself, covering the
// .partial download plus headroom so the user's disk isn't filled to the brim.
const DISK_HEADROOM_GB = 2;

// Tier ladder, lightest first. "coding" is a specialized alternative, never an
// automatic pick, so it is excluded from the level mapping.
const TIER_BY_LEVEL: ModelTier[] = ["light", "recommended", "highPerformance"];

function ramTierLevel(totalRamGb: number | null): number {
  if (totalRamGb === null || totalRamGb <= 8) return 0;
  if (totalRamGb <= 16) return 1;
  return 2;
}

// Mirrors the §5 VRAM breakpoints (6GB → 7B, 12GB → 14B). Returns -1 when there
// is no GPU signal so it can never lower the RAM-based pick.
function vramTierLevel(vramGb: number | null): number {
  if (vramGb === null) return -1;
  if (vramGb >= 12) return 2;
  if (vramGb >= 6) return 1;
  return 0;
}

// The GPU "drove" the pick when a real VRAM signal (>=6GB) is at least as high
// as the RAM tier — that is when GPU-accelerated inference is the reason the
// primary is viable, so the reason string should say so.
function isGpuDriven(profile: HardwareProfile): boolean {
  const vramGb = profile.gpu?.vramGb ?? null;
  if (vramGb === null) return false;
  return vramTierLevel(vramGb) >= 1 && vramTierLevel(vramGb) >= ramTierLevel(profile.totalRamGb);
}

function pickTier(profile: HardwareProfile): ModelTier {
  const level = Math.max(ramTierLevel(profile.totalRamGb), vramTierLevel(profile.gpu?.vramGb ?? null), 0);
  return TIER_BY_LEVEL[level];
}

function byTier(catalog: LocalModelOption[], tier: ModelTier): LocalModelOption | undefined {
  return catalog.find((model) => model.recommendedTier === tier);
}

function buildReason(profile: HardwareProfile, primary: LocalModelOption, gpuDriven: boolean, t: TranslateFn): string {
  if (gpuDriven && profile.gpu?.vramGb != null) {
    return t("localAi.reason.gpu", { vram: Math.round(profile.gpu.vramGb), model: primary.displayName });
  }
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
  const gpuDriven = isGpuDriven(profile);
  const tier = pickTier(profile);
  const primary = byTier(catalog, tier) ?? catalog[0];
  if (!primary) {
    throw new Error("Local model catalog is empty.");
  }

  // Only warn about unknown RAM when it actually forced a conservative pick —
  // a detected GPU makes the recommendation confident regardless of RAM.
  if (profile.totalRamGb === null && !gpuDriven) {
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

  // VRAM guidance (design §5). When the GPU already drove the pick the reason
  // string covers it, so only surface this as extra guidance otherwise (e.g. a
  // GPU is present but RAM picked an even larger model).
  const vramGb = profile.gpu?.vramGb ?? null;
  if (!gpuDriven && vramGb !== null && vramGb >= 12) {
    warnings.push(t("localAi.warning.vram12"));
  } else if (!gpuDriven && vramGb !== null && vramGb >= 6) {
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
    reason: buildReason(profile, primary, gpuDriven, t),
    warnings,
  };
}
