import type { LocalModelOption } from "./types";

// Hosts a model download may come from. Anything else is rejected in code
// before a request is made (LOCAL_AI_SYSTEM_DESIGN.md §11.1).
// TODO(release): confirm the final host list when downloadUrl values are set.
export const MODEL_DOWNLOAD_ALLOWLIST = ["huggingface.co", "cdn-lfs.huggingface.co"] as const;

export function isAllowedDownloadUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return MODEL_DOWNLOAD_ALLOWLIST.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

// Initial catalog (LOCAL_AI_SYSTEM_DESIGN.md §4). Estimated sizes come from
// the official Qwen GGUF repos' Q4_K_M files; treat them as UI hints, not
// exact byte counts.
//
// TODO(release): fill downloadUrl + expectedSha256 from the official
// Qwen/Qwen2.5-*-Instruct-GGUF repositories and verify the hashes. Until
// then the installer must refuse to start a download for these entries.
export const LOCAL_MODEL_CATALOG: LocalModelOption[] = [
  {
    id: "qwen2.5-3b-instruct-q4_k_m",
    displayName: "Qwen2.5 3B Instruct (Q4_K_M)",
    family: "Qwen2.5",
    parameterSize: "3B",
    quantization: "Q4_K_M",
    recommendedTier: "light",
    estimatedSizeGb: 2.0,
    minRamGb: 6,
    recommendedRamGb: 8,
    description: "가벼움 — 저사양 노트북에서도 빠르게 동작. 브리핑·요약 같은 짧은 작업에 적합.",
  },
  {
    id: "qwen2.5-7b-instruct-q4_k_m",
    displayName: "Qwen2.5 7B Instruct (Q4_K_M)",
    family: "Qwen2.5",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    recommendedTier: "recommended",
    estimatedSizeGb: 4.7,
    minRamGb: 12,
    recommendedRamGb: 16,
    description: "추천 — 속도와 품질의 균형. 오늘 브리핑, 작업 쪼개기, 집중 세션 추천에 두루 적합.",
  },
  {
    id: "qwen2.5-coder-7b-instruct-q4_k_m",
    displayName: "Qwen2.5 Coder 7B Instruct (Q4_K_M)",
    family: "Qwen2.5 Coder",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    recommendedTier: "coding",
    estimatedSizeGb: 4.7,
    minRamGb: 12,
    recommendedRamGb: 16,
    description: "코딩 특화 — 개발 노트·코드 스니펫이 많은 vault와 개발 작업 분해에 유리.",
  },
  {
    id: "qwen2.5-14b-instruct-q4_k_m",
    displayName: "Qwen2.5 14B Instruct (Q4_K_M)",
    family: "Qwen2.5",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    recommendedTier: "highPerformance",
    estimatedSizeGb: 9.0,
    minRamGb: 24,
    recommendedRamGb: 32,
    description: "고성능 — 32GB RAM 이상에서 최고 품질의 브리핑과 계획 수립.",
  },
];

export function findModelById(id: string): LocalModelOption | undefined {
  return LOCAL_MODEL_CATALOG.find((model) => model.id === id);
}
