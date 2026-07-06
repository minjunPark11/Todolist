// ModelRecommender (LOCAL_AI_SYSTEM_DESIGN.md §5): pure function from a
// hardware profile to a recommendation, so it can be unit-tested without any
// Tauri runtime. RAM drives the pick; GPU/VRAM only adds guidance until GPU
// detection lands (profile.gpu is always null in Phase 0).
import { LOCAL_MODEL_CATALOG } from "./modelCatalog";
import type { HardwareProfile, LocalModelOption, ModelRecommendation, ModelTier } from "./types";

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

function buildReason(profile: HardwareProfile, primary: LocalModelOption): string {
  if (profile.totalRamGb === null) {
    return `메모리 용량을 확인하지 못해 가장 가벼운 ${primary.displayName}을(를) 추천해요.`;
  }
  const ram = Math.round(profile.totalRamGb);
  switch (primary.recommendedTier) {
    case "light":
      return `RAM ${ram}GB 환경에서는 ${primary.displayName}이(가) 부담 없이 빠르게 동작해요.`;
    case "highPerformance":
      return `RAM ${ram}GB면 ${primary.displayName}으로 최고 품질의 답변을 받을 수 있어요.`;
    default:
      return `RAM ${ram}GB에서는 ${primary.displayName}이(가) 속도와 품질의 균형이 가장 좋아요.`;
  }
}

export function recommendLocalModel(
  profile: HardwareProfile,
  catalog: LocalModelOption[] = LOCAL_MODEL_CATALOG,
): ModelRecommendation {
  const warnings: string[] = [];
  const tier = pickTier(profile.totalRamGb);
  const primary = byTier(catalog, tier) ?? catalog[0];
  if (!primary) {
    throw new Error("Local model catalog is empty.");
  }

  if (profile.totalRamGb === null) {
    warnings.push("메모리 용량을 확인할 수 없어 보수적으로 추천했어요. 직접 모델을 선택할 수도 있어요.");
  }

  if (
    profile.availableDiskGb !== null &&
    profile.availableDiskGb < primary.estimatedSizeGb + DISK_HEADROOM_GB
  ) {
    warnings.push(
      `저장공간이 부족할 수 있어요. 이 모델은 약 ${primary.estimatedSizeGb}GB가 필요해요 (여유 공간 ${profile.availableDiskGb.toFixed(1)}GB).`,
    );
  }

  // VRAM guidance (design §5). profile.gpu stays null until GPU detection
  // ships, so these branches are inert in Phase 0 but the thresholds are the
  // contract the detector must feed.
  const vramGb = profile.gpu?.vramGb ?? null;
  if (vramGb !== null && vramGb >= 12) {
    warnings.push("VRAM 12GB 이상이 감지됐어요. 14B Q4 또는 고품질 8B 모델도 GPU 가속으로 쾌적하게 쓸 수 있어요.");
  } else if (vramGb !== null && vramGb >= 6) {
    warnings.push("VRAM 6GB 이상이 감지됐어요. 7B Q4 모델을 GPU 가속으로 실행할 수 있어요.");
  }

  // "더 가벼운 / 추천 / 고급" choices: everything runnable-adjacent except the
  // primary, ordered lighter-first so the UI can render them as-is.
  const alternatives = catalog
    .filter((model) => model.id !== primary.id)
    .sort((a, b) => a.estimatedSizeGb - b.estimatedSizeGb);

  return {
    primary,
    alternatives,
    reason: buildReason(profile, primary),
    warnings,
  };
}
