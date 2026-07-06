import type { LocalModelOption } from "./types";

// Hosts a catalog downloadUrl may point at; anything else is rejected before a
// request is made (LOCAL_AI_SYSTEM_DESIGN.md §11.1). Only the initial URL is
// gated here — huggingface.co's resolve endpoint 302-redirects to its CDN
// (e.g. *.hf.co), and the HTTP client follows that automatically. The gate's
// job is to stop a compromised webview from pointing the downloader at an
// arbitrary host, which holds as long as every catalog URL starts at HF.
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

// Initial catalog (LOCAL_AI_SYSTEM_DESIGN.md §4).
//
// downloadUrl / expectedSha256 come from bartowski's Qwen2.5 GGUF repos, which
// publish single-file Q4_K_M builds (the official Qwen/*-GGUF repos shard 7B+
// into multiple files, which the single-file installer can't stitch). Each
// expectedSha256 is the file's Hugging Face LFS oid (= sha256 of the content),
// and estimatedSizeGb is the exact file size in GiB. The Rust downloader
// re-verifies the hash on install, so a mismatch fails the download rather than
// storing a bad file. TODO(Phase 7): re-verify hashes via a full download in
// real-device QA.
export const LOCAL_MODEL_CATALOG: LocalModelOption[] = [
  {
    id: "qwen2.5-3b-instruct-q4_k_m",
    displayName: "Qwen2.5 3B Instruct (Q4_K_M)",
    family: "Qwen2.5",
    parameterSize: "3B",
    quantization: "Q4_K_M",
    recommendedTier: "light",
    estimatedSizeGb: 1.8,
    minRamGb: 6,
    recommendedRamGb: 8,
    description: "localAi.model.qwen3b.description",
    downloadUrl:
      "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    expectedSha256: "9c9f56a391a3abbd5b89d0245bf6106081bcc3173119d4229235dd9d23253f94",
  },
  {
    id: "qwen2.5-7b-instruct-q4_k_m",
    displayName: "Qwen2.5 7B Instruct (Q4_K_M)",
    family: "Qwen2.5",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    recommendedTier: "recommended",
    estimatedSizeGb: 4.4,
    minRamGb: 12,
    recommendedRamGb: 16,
    description: "localAi.model.qwen7b.description",
    downloadUrl:
      "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    expectedSha256: "65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423",
  },
  {
    id: "qwen2.5-coder-7b-instruct-q4_k_m",
    displayName: "Qwen2.5 Coder 7B Instruct (Q4_K_M)",
    family: "Qwen2.5 Coder",
    parameterSize: "7B",
    quantization: "Q4_K_M",
    recommendedTier: "coding",
    estimatedSizeGb: 4.4,
    minRamGb: 12,
    recommendedRamGb: 16,
    description: "localAi.model.qwenCoder7b.description",
    downloadUrl:
      "https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    expectedSha256: "1664fccab734674a50763490a8c6931b70e3f2f8ec10031b54806d30e5f956b6",
  },
  {
    id: "qwen2.5-14b-instruct-q4_k_m",
    displayName: "Qwen2.5 14B Instruct (Q4_K_M)",
    family: "Qwen2.5",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    recommendedTier: "highPerformance",
    estimatedSizeGb: 8.4,
    minRamGb: 24,
    recommendedRamGb: 32,
    description: "localAi.model.qwen14b.description",
    downloadUrl:
      "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf",
    expectedSha256: "e47ad95dad6ff848b431053b375adb5d39321290ea2c638682577dafca87c008",
  },
];

export function findModelById(id: string): LocalModelOption | undefined {
  return LOCAL_MODEL_CATALOG.find((model) => model.id === id);
}
