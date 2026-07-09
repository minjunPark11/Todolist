// Catalog of official llama.cpp release binaries the runtime installer can
// fetch (LOCAL_AI_SYSTEM_DESIGN.md §7.7). Same trust model as the model
// catalog: allowlisted host + pinned sha256, verified by the Rust downloader on
// install. Keyed by `${os}-${arch}` using std::env::consts::OS / ARCH values
// (windows/macos/linux, x86_64/aarch64), resolved from get_local_ai_platform so
// a universal macOS app picks the slice it actually runs as.
//
// Pinned to llama.cpp release b9885. Windows ships the Vulkan build: the
// sidecar passes -ngl 999 (local_ai.rs), and on-device measurement (Core
// Ultra 7 155H + Arc iGPU) showed 4x faster prompt processing vs the CPU
// build (29 → 115 tok/s). Machines without a usable Vulkan device are safe:
// llama.cpp's dynamic backend loading skips ggml-vulkan when it can't
// initialize and falls back to the bundled CPU backend. macOS builds carry
// Metal already. Only the release workflow's shipped targets are listed;
// Linux is a follow-up.
export interface ServerRuntimeAsset {
  // llama.cpp release tag, surfaced in the UI and for support/debugging.
  version: string;
  downloadUrl: string;
  expectedSha256: string;
  // Compressed archive size hint (GiB) for the download UI.
  sizeGb: number;
}

const RELEASE = "b9885";
const RELEASE_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${RELEASE}`;

export const SERVER_RUNTIME_CATALOG: Record<string, ServerRuntimeAsset> = {
  "windows-x86_64": {
    version: `${RELEASE}-vulkan`,
    downloadUrl: `${RELEASE_BASE}/llama-${RELEASE}-bin-win-vulkan-x64.zip`,
    expectedSha256: "ec7cc287cb88e6af9829660b5c91de5f4927d38e424a5c1929a5ec711b277bb7",
    sizeGb: 0.1,
  },
  "macos-aarch64": {
    version: RELEASE,
    downloadUrl: `${RELEASE_BASE}/llama-${RELEASE}-bin-macos-arm64.tar.gz`,
    expectedSha256: "a2d8f560a269cdfc834aa40eca738b270ecccfe98681ac71595857cf1724baba",
    sizeGb: 0.1,
  },
  "macos-x86_64": {
    version: RELEASE,
    downloadUrl: `${RELEASE_BASE}/llama-${RELEASE}-bin-macos-x64.tar.gz`,
    expectedSha256: "c41af62593fa6450ec9901b7e2d6edd39820e67c78b7b63c0f1fc9925856d613",
    sizeGb: 0.1,
  },
};

// The runtime asset for the given target, or null when no build is pinned for
// it (the UI then explains the runtime isn't available for this platform).
export function resolveServerRuntimeAsset(os: string, arch: string): ServerRuntimeAsset | null {
  return SERVER_RUNTIME_CATALOG[`${os}-${arch}`] ?? null;
}
