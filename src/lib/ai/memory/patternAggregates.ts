// Pattern aggregates (User Patterns slice B): pure, deterministic rollups over
// the raw turn log (slice A) joined with the outcome log. No model runs here —
// slice C is the only layer where a model proposes memories from these numbers,
// and only with user approval (see docs/Features/User_Patterns.md).
//
// Everything is computed from fields the logs already persist. Two of the §4
// aggregates are intentionally NOT here because the turn log has no source
// signal for them yet: the "break it smaller" follow-up rate (needs the
// refinement buttons to tag their turns) and the per-slot-kind unresolved
// distribution (needs the turn log to store info slots). Both would require a
// turnLog schema addition; until then this module reports only what the data
// supports, plus stage/response-mode distributions as the closest proxies.
import type { AiSafeActionType } from "../actions/types";
import type { CardStage } from "../contextCards/types";
import type { ResponseMode } from "../assistant/types";
import type { AiOutcomeLogEntry } from "./outcomeLog";
import type { AiTurnLogEntry } from "./turnLog";

// Three coarse buckets ("아침/오후/밤") — fine enough to reveal when the user
// tends to get stuck without over-fitting to a sparse local log.
export type TimeBucket = "morning" | "afternoon" | "night";
export const TIME_BUCKETS: readonly TimeBucket[] = ["morning", "afternoon", "night"];

// 0 = Sunday … 6 = Saturday (matches Date.getDay()).
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type StuckRatioBucket<K> = {
  key: K;
  // Turns we can judge for stuck-ness (assistant-flow turns with a responseMode).
  judged: number;
  // Of those, how many were an overwhelm/friction moment.
  stuck: number;
  // stuck / judged, or 0 when judged === 0.
  ratio: number;
};

export type DomainCount = { domain: string; count: number };

export type AcceptanceTally = {
  proposed: number; // still pending (no user decision)
  accepted: number; // accepted + saved_as_task
  rejected: number;
  failed: number;
  // accepted / (accepted + rejected); pending and failed are excluded from the
  // denominator. 0 when nothing has been decided yet.
  acceptanceRate: number;
};

export type AcceptanceByType = AcceptanceTally & { type: AiSafeActionType };
export type AcceptanceByMode = AcceptanceTally & { mode: ResponseMode };

export type PatternAggregates = {
  // Corpus size, split by where the turn came from.
  totalTurns: number;
  assistantTurns: number; // assistant_panel + chat_assistant
  freeChatTurns: number; // chat_free (personal agent)
  // How often the user gets stuck, sliced two ways. Fixed order/length:
  // stuckByTime always has 3 entries, stuckByWeekday always has 7.
  stuckByTime: StuckRatioBucket<TimeBucket>[];
  stuckByWeekday: StuckRatioBucket<Weekday>[];
  // Domains the user repeatedly brings to the assistant, most frequent first.
  topDomains: DomainCount[];
  // Distribution of the deterministic classifications, useful context for C.
  responseModeCounts: Partial<Record<ResponseMode, number>>;
  stageCounts: Partial<Record<CardStage, number>>;
  // Did the suggestion actually get taken? Overall, by action type, and by the
  // response mode of the turn that produced it (the join the doc asks for).
  acceptance: {
    overall: AcceptanceTally;
    byType: AcceptanceByType[];
    byMode: AcceptanceByMode[];
  };
};

const DEFAULT_TOP_DOMAINS = 8;

function timeBucket(hour: number): TimeBucket {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  return "night"; // 18–23 and 0–4
}

// A turn we can judge for stuck-ness: assistant-flow turns carry a responseMode.
// Free-chat turns have none and are excluded from the ratio denominators.
function isJudgeable(entry: AiTurnLogEntry): boolean {
  return entry.responseMode !== undefined;
}

function isStuck(entry: AiTurnLogEntry): boolean {
  if (entry.responseMode === "overwhelm") return true;
  const friction = entry.inputSignals?.frictionSignal;
  return friction !== undefined && friction !== "none";
}

function emptyTally(): AcceptanceTally {
  return { proposed: 0, accepted: 0, rejected: 0, failed: 0, acceptanceRate: 0 };
}

function addOutcome(tally: AcceptanceTally, status: AiOutcomeLogEntry["status"]) {
  switch (status) {
    case "accepted":
    case "saved_as_task":
      tally.accepted += 1;
      break;
    case "rejected":
      tally.rejected += 1;
      break;
    case "failed":
      tally.failed += 1;
      break;
    case "proposed":
    default:
      tally.proposed += 1;
      break;
  }
}

function finalizeRate<T extends AcceptanceTally>(tally: T): T {
  const decided = tally.accepted + tally.rejected;
  tally.acceptanceRate = decided === 0 ? 0 : tally.accepted / decided;
  return tally;
}

export function computePatternAggregates(
  turns: AiTurnLogEntry[],
  outcomes: AiOutcomeLogEntry[],
  options: { topDomains?: number } = {},
): PatternAggregates {
  const topDomainsLimit = options.topDomains ?? DEFAULT_TOP_DOMAINS;

  let assistantTurns = 0;
  let freeChatTurns = 0;
  const timeBuckets = new Map<TimeBucket, { judged: number; stuck: number }>();
  const weekdayBuckets = new Map<Weekday, { judged: number; stuck: number }>();
  const domainCounts = new Map<string, number>();
  const responseModeCounts: Partial<Record<ResponseMode, number>> = {};
  const stageCounts: Partial<Record<CardStage, number>> = {};
  // turnId → responseMode, so outcomes can be attributed to the turn's mode.
  const modeByTurnId = new Map<string, ResponseMode>();

  for (const entry of turns) {
    if (entry.source === "chat_free") freeChatTurns += 1;
    else assistantTurns += 1;

    if (entry.responseMode) {
      responseModeCounts[entry.responseMode] = (responseModeCounts[entry.responseMode] ?? 0) + 1;
      modeByTurnId.set(entry.id, entry.responseMode);
    }
    if (entry.stage) {
      stageCounts[entry.stage] = (stageCounts[entry.stage] ?? 0) + 1;
    }
    for (const domain of entry.domains ?? []) {
      const key = domain.trim();
      if (key) domainCounts.set(key, (domainCounts.get(key) ?? 0) + 1);
    }

    if (isJudgeable(entry)) {
      const date = new Date(entry.createdAt);
      // Guard against an unparseable timestamp; a NaN hour would corrupt buckets.
      if (!Number.isNaN(date.getTime())) {
        const stuck = isStuck(entry);
        const tb = timeBucket(date.getHours());
        const timeSlot = timeBuckets.get(tb) ?? { judged: 0, stuck: 0 };
        timeSlot.judged += 1;
        if (stuck) timeSlot.stuck += 1;
        timeBuckets.set(tb, timeSlot);

        const wd = date.getDay() as Weekday;
        const wdSlot = weekdayBuckets.get(wd) ?? { judged: 0, stuck: 0 };
        wdSlot.judged += 1;
        if (stuck) wdSlot.stuck += 1;
        weekdayBuckets.set(wd, wdSlot);
      }
    }
  }

  const stuckByTime: StuckRatioBucket<TimeBucket>[] = TIME_BUCKETS.map((key) => {
    const slot = timeBuckets.get(key) ?? { judged: 0, stuck: 0 };
    return { key, judged: slot.judged, stuck: slot.stuck, ratio: slot.judged === 0 ? 0 : slot.stuck / slot.judged };
  });

  const stuckByWeekday: StuckRatioBucket<Weekday>[] = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((key) => {
    const slot = weekdayBuckets.get(key) ?? { judged: 0, stuck: 0 };
    return { key, judged: slot.judged, stuck: slot.stuck, ratio: slot.judged === 0 ? 0 : slot.stuck / slot.judged };
  });

  const topDomains: DomainCount[] = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    // Count desc, then domain asc for a stable, deterministic order on ties.
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, topDomainsLimit);

  const overall = emptyTally();
  const byTypeMap = new Map<AiSafeActionType, AcceptanceByType>();
  const byModeMap = new Map<ResponseMode, AcceptanceByMode>();

  for (const outcome of outcomes) {
    addOutcome(overall, outcome.status);

    const type = outcome.proposedAction?.type;
    if (type) {
      const tally = byTypeMap.get(type) ?? { type, ...emptyTally() };
      addOutcome(tally, outcome.status);
      byTypeMap.set(type, tally);
    }

    const mode = modeByTurnId.get(outcome.assistantTurnId);
    if (mode) {
      const tally = byModeMap.get(mode) ?? { mode, ...emptyTally() };
      addOutcome(tally, outcome.status);
      byModeMap.set(mode, tally);
    }
  }

  finalizeRate(overall);
  const byType = [...byTypeMap.values()].map(finalizeRate).sort((a, b) => a.type.localeCompare(b.type));
  const byMode = [...byModeMap.values()].map(finalizeRate).sort((a, b) => a.mode.localeCompare(b.mode));

  return {
    totalTurns: turns.length,
    assistantTurns,
    freeChatTurns,
    stuckByTime,
    stuckByWeekday,
    topDomains,
    responseModeCounts,
    stageCounts,
    acceptance: { overall, byType, byMode },
  };
}
