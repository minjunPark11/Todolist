// Catalog of official llama.cpp release binaries the runtime installer can
// fetch (LOCAL_AI_SYSTEM_DESIGN.md §7.7). Same trust model as the model
// catalog: allowlisted host + pinned sha256, verified by the Rust downloader on
// install. Keyed by `${os}-${arch}` using the same values as HardwareProfile
// (std::env::consts::OS / ARCH).
//
// Pinned to llama.cpp release b9885, Windows x64 CPU build. The CPU build runs
// everywhere without GPU drivers and matches the current sidecar spawn args (no
// -ngl). TODO(Phase 6+): add macOS (arm64/x64) and Linux entries, and GPU
// builds (Vulkan/CUDA) once -ngl offload is wired.
export interface ServerRuntimeAsset {
  // llama.cpp release tag, surfaced in the UI and for support/debugging.
  version: string;
  downloadUrl: string;
  expectedSha256: string;
  // Uncompressed archive size hint (GiB) for the download UI.
  sizeGb: number;
}

export const SERVER_RUNTIME_CATALOG: Record<string, ServerRuntimeAsset> = {
  "windows-x86_64": {
    version: "b9885",
    downloadUrl:
      "https://github.com/ggml-org/llama.cpp/releases/download/b9885/llama-b9885-bin-win-cpu-x64.zip",
    expectedSha256: "0f88b475892930f201a2f4ae185a01afef6eb355fc302508d57f5f3cf7471d0b",
    sizeGb: 0.1,
  },
};

// Detects the running desktop OS from the webview UA. Arch is assumed x86_64:
// the only shipped asset is Windows x64, and Windows-on-ARM can run it emulated
// until a native arm64 build is added.
function currentPlatformKey(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows-x86_64";
  // macOS/Linux assets aren't published yet, so return their keys only once the
  // catalog has entries for them (keeps resolveServerRuntimeAsset null-safe).
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos-x86_64";
  if (/Linux/i.test(ua)) return "linux-x86_64";
  return null;
}

// The runtime asset for this machine, or null when the platform has no pinned
// build yet (the UI then explains the runtime isn't available for it).
export function resolveServerRuntimeAsset(): ServerRuntimeAsset | null {
  const key = currentPlatformKey();
  return key ? (SERVER_RUNTIME_CATALOG[key] ?? null) : null;
}
