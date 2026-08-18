// Decides WHEN a save runs, the way buildSyncPlan decides what it writes.
// Pure — no Supabase, no React, no real timers — so the ordering rules below
// can be tested directly instead of only against a live account on a slow line.
//
// The problem it solves (§16.34 "mutation race", "network failure"): saves were
// fired from a debounce with nothing serializing them. Two could be in flight at
// once, and the network does not promise they finish in order, so the OLDER save
// could land last and write the previous version of the rows it touched — and
// then move the sync baseline BACKWARDS, so the account kept that older content
// until the user happened to edit again. A failed save had the mirror problem:
// nothing retried it, so edits sat unsent until the next keystroke.

export type SaveQueueOptions<T> = {
  /** Performs one save. Rejects to signal failure. */
  perform: (payload: T) => Promise<void>;
  /** Called after every settled run, so the caller can surface sync status. */
  onSettled?: (result: { ok: boolean; error?: unknown; willRetry: boolean }) => void;
  /** Schedules the retry of a failed save. Injected so tests need no clock. */
  scheduleRetry?: (run: () => void, delayMs: number) => void;
  /** Backoff for the first retry; doubles up to retryMaxDelayMs. */
  retryDelayMs?: number;
  retryMaxDelayMs?: number;
};

export type SaveQueue<T> = {
  /**
   * Asks for `payload` to be saved. While a save is running this only records
   * the payload — it does not start a second one. Requests made during a run
   * COALESCE: the last one wins, because it already contains every earlier
   * edit (each payload is the whole state, not a delta).
   */
  request: (payload: T) => void;
  /**
   * Drops pending work and disowns whatever is in flight, so its result is
   * neither applied nor retried. For sign-out and account switches: that
   * payload belongs to an account this queue is no longer saving for.
   */
  reset: () => void;
  readonly isRunning: boolean;
  readonly hasPending: boolean;
};

const DEFAULT_RETRY_DELAY_MS = 4000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;

export function createSaveQueue<T>(options: SaveQueueOptions<T>): SaveQueue<T> {
  const {
    perform,
    onSettled,
    scheduleRetry = (run, delayMs) => setTimeout(run, delayMs),
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    retryMaxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
  } = options;

  let running = false;
  let hasPending = false;
  let pending: T | undefined;
  let retryDelay = retryDelayMs;
  // Bumped by reset(). A run started under an older generation may still be in
  // flight; it must not schedule a retry or start the queue's next run.
  let generation = 0;

  function run(): void {
    if (running || !hasPending) return;

    const payload = pending as T;
    const startedGeneration = generation;
    hasPending = false;
    pending = undefined;
    running = true;

    perform(payload).then(
      () => {
        running = false;
        if (startedGeneration !== generation) return;
        retryDelay = retryDelayMs;
        onSettled?.({ ok: true, willRetry: false });
        run();
      },
      (error: unknown) => {
        running = false;
        if (startedGeneration !== generation) return;
        // A newer payload arrived while this one was failing: it supersedes
        // this attempt, so retry that instead of resending what it replaced.
        if (!hasPending) {
          pending = payload;
          hasPending = true;
        }
        onSettled?.({ ok: false, error, willRetry: true });
        const delay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, retryMaxDelayMs);
        scheduleRetry(() => {
          if (startedGeneration !== generation) return;
          run();
        }, delay);
      },
    );
  }

  return {
    request(payload: T) {
      pending = payload;
      hasPending = true;
      retryDelay = retryDelayMs;
      run();
    },
    reset() {
      generation += 1;
      running = false;
      hasPending = false;
      pending = undefined;
      retryDelay = retryDelayMs;
    },
    get isRunning() {
      return running;
    },
    get hasPending() {
      return hasPending;
    },
  };
}
