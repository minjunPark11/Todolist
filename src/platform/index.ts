import { isTauriRuntime, tauriPlatform } from "./tauri";
import type { PlatformAdapter } from "./types";
import { webPlatform } from "./web";

export const platform: PlatformAdapter = isTauriRuntime() ? tauriPlatform : webPlatform;

export type { PlatformAdapter, PlatformKind } from "./types";
