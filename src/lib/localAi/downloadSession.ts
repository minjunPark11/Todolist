import { SERVER_RUNTIME_DOWNLOAD_ID, installServerRuntime, startModelDownload } from "./installer";
import type { LocalModelOption, ModelDownloadOutcome, ModelDownloadProgress } from "./types";
import { platform } from "../../platform";

type DownloadKind = "model" | "runtime";

type DownloadResult = {
  id: string;
  kind: DownloadKind;
  outcome: ModelDownloadOutcome;
  completedAt: number;
};

export type LocalAiDownloadSessionSnapshot = {
  downloadingId: string;
  kind: DownloadKind | null;
  progress: ModelDownloadProgress | null;
  error: string;
  result: DownloadResult | null;
};

const listeners = new Set<() => void>();

let snapshot: LocalAiDownloadSessionSnapshot = {
  downloadingId: "",
  kind: null,
  progress: null,
  error: "",
  result: null,
};

let progressSubscriptionStarted = false;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(patch: Partial<LocalAiDownloadSessionSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emitChange();
}

function ensureProgressSubscription() {
  if (progressSubscriptionStarted || !platform.localAi.supported()) return;
  progressSubscriptionStarted = true;
  void platform.localAi.subscribeDownloadProgress((progress) => {
    if (snapshot.downloadingId !== progress.modelId) return;
    updateSnapshot({ progress });
  }).catch(() => {
    progressSubscriptionStarted = false;
  });
}

export function subscribeLocalAiDownloadSession(listener: () => void) {
  ensureProgressSubscription();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocalAiDownloadSessionSnapshot() {
  return snapshot;
}

async function runTrackedDownload(
  id: string,
  kind: DownloadKind,
  run: () => Promise<ModelDownloadOutcome>,
) {
  ensureProgressSubscription();
  if (snapshot.downloadingId) {
    updateSnapshot({ error: "A Local AI download is already in progress." });
    return;
  }

  updateSnapshot({
    downloadingId: id,
    kind,
    progress: { modelId: id, receivedBytes: 0, totalBytes: null },
    error: "",
    result: null,
  });

  try {
    const outcome = await run();
    updateSnapshot({
      downloadingId: "",
      kind: null,
      progress: null,
      result: { id, kind, outcome, completedAt: Date.now() },
    });
  } catch (error) {
    updateSnapshot({
      downloadingId: "",
      kind: null,
      progress: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function startTrackedModelDownload(model: LocalModelOption) {
  void runTrackedDownload(model.id, "model", () => startModelDownload(model));
}

export function startTrackedServerRuntimeInstall() {
  void runTrackedDownload(SERVER_RUNTIME_DOWNLOAD_ID, "runtime", installServerRuntime);
}
