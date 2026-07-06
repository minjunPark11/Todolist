type TFn = (key: string, vars?: Record<string, string | number>) => string;

export type SpaceBriefingPriority = "High" | "Medium" | "Low";

export type SpaceBriefingSpace = {
  id: string;
  name: string;
  type: string;
  status: string;
  mainSignal: string;
  aiPriority: SpaceBriefingPriority;
  recentActivityCount: number;
  description?: string;
  updatedLabel?: string;
  topics?: string[];
};

export type SpaceBriefingSignal = {
  title: string;
  detail: string;
  age: string;
  severity: SpaceBriefingPriority;
  spaceId: string;
};

export type SpaceBriefing = {
  headline: string;
  body: string;
  detailLines: string[];
  attentionSpaceIds: string[];
};

const priorityWeight: Record<SpaceBriefingPriority, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export function buildSpaceBriefing(spaces: SpaceBriefingSpace[], signals: SpaceBriefingSignal[], t: TFn): SpaceBriefing {
  if (spaces.length === 0) {
    return {
      headline: t("spaces.brief.emptyTitle"),
      body: t("spaces.brief.emptyBody"),
      detailLines: [],
      attentionSpaceIds: [],
    };
  }

  const signalCounts = new Map<string, { total: number; high: number; medium: number }>();
  for (const signal of signals) {
    const current = signalCounts.get(signal.spaceId) ?? { total: 0, high: 0, medium: 0 };
    current.total += 1;
    if (signal.severity === "High") current.high += 1;
    if (signal.severity === "Medium") current.medium += 1;
    signalCounts.set(signal.spaceId, current);
  }

  const ranked = spaces
    .map((space) => {
      const counts = signalCounts.get(space.id) ?? { total: 0, high: 0, medium: 0 };
      const score = priorityWeight[space.aiPriority] * 10 + counts.high * 4 + counts.medium * 2 + Math.min(counts.total, 5);
      return { space, counts, score };
    })
    .sort((a, b) => b.score - a.score || a.space.name.localeCompare(b.space.name));

  const attention = ranked.filter((item) => item.space.aiPriority !== "Low" || item.counts.high > 0 || item.counts.medium > 0).slice(0, 3);
  const selected = attention.length > 0 ? attention : ranked.slice(0, Math.min(2, ranked.length));
  const attentionSpaceIds = selected.map((item) => item.space.id);
  const names = selected.map((item) => item.space.name).join(", ");
  const hasRealAttention = attention.length > 0;

  return {
    headline: hasRealAttention
      ? t(selected.length === 1 ? "spaces.brief.baselineHeadlineAttentionOne" : "spaces.brief.baselineHeadlineAttention", { n: selected.length })
      : t("spaces.brief.baselineHeadlineHealthy"),
    body: hasRealAttention
      ? t("spaces.brief.baselineBodyAttention", { names })
      : t("spaces.brief.baselineBodyHealthy"),
    detailLines: selected.map(({ space, counts }) =>
      counts.total > 0
        ? t("spaces.brief.baselineDetailWithSignals", {
            name: space.name,
            signal: space.mainSignal,
            count: counts.total,
            priority: t(`spaces.priority.${space.aiPriority.toLowerCase()}`),
          })
        : t("spaces.brief.baselineDetailNoSignals", {
            name: space.name,
            signal: space.mainSignal,
            priority: t(`spaces.priority.${space.aiPriority.toLowerCase()}`),
          }),
    ),
    attentionSpaceIds,
  };
}

export function buildSpaceBriefingContext(spaces: SpaceBriefingSpace[], signals: SpaceBriefingSignal[]): string {
  const signalsBySpace = new Map<string, SpaceBriefingSignal[]>();
  for (const signal of signals) {
    signalsBySpace.set(signal.spaceId, [...(signalsBySpace.get(signal.spaceId) ?? []), signal]);
  }

  const spaceLines = spaces.map((space) => {
    const spaceSignals = signalsBySpace.get(space.id) ?? [];
    const signalSummary = spaceSignals.length
      ? spaceSignals.map((signal) => `${signal.severity}: ${signal.title} (${signal.detail}, ${signal.age})`).join("; ")
      : "No recent signals";
    return [
      `Space: ${space.name}`,
      `Type: ${space.type}`,
      `Status: ${space.status}`,
      `Priority: ${space.aiPriority}`,
      `Main signal: ${space.mainSignal}`,
      `Description: ${space.description || ""}`,
      `Recent activity count: ${space.recentActivityCount}`,
      `Updated: ${space.updatedLabel || ""}`,
      `Topics: ${(space.topics ?? []).join(", ")}`,
      `Signals: ${signalSummary}`,
    ].join("\n");
  });

  return `FocusFlow Spaces briefing context. Use only these records.\n\n${spaceLines.join("\n\n---\n\n")}`;
}
