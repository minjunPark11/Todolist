import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for platform.storage so the log round-trips without a
// browser localStorage.
const memoryStore = new Map<string, string>();
vi.mock("../../../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => memoryStore.get(key) ?? null,
      setSync: (key: string, value: string) => {
        memoryStore.set(key, value);
      },
      removeSync: (key: string) => {
        memoryStore.delete(key);
      },
    },
  },
}));

import type { AssistantTurn } from "../assistant/types";
import {
  clearTurnLog,
  isTurnLogEnabled,
  loadTurnLog,
  logAssistantTurn,
  logFreeChatTurn,
  setTurnLogEnabled,
  turnLogCount,
} from "./turnLog";

function fakeTurn(id: string): AssistantTurn {
  return {
    id,
    provider: "llama-server",
    mode: "ready_for_next_action",
    responseMode: "overwhelm",
    inputSignals: {
      decisionSignal: "strong",
      frictionSignal: "weak",
      lowActionabilitySignal: "none",
      blockerSignal: "none",
      externalPressureSignal: "none",
      unscopedProjectSignal: "none",
    },
    userFacingText: "정리해봤어요. 이 작업부터 시작하는 게 좋겠어요.",
    isDirectAnswer: false,
    contextCardDraft: {
      title: "중국어/논문 정리",
      rawInput: "",
      detectedItems: ["중국어", "논문"],
      inferredDomains: ["language learning", "thesis"],
      workTypes: [],
      currentStatus: [],
      likelyBlockers: [],
      missingInfo: [],
      possibleOutputs: [],
      stage: "scoping",
      relatedTaskIds: [],
      relatedProjectIds: [],
      relatedNotePaths: [],
    },
    usedFallbackDraft: false,
    usedGenericFailureFallback: false,
    validation: { ok: true, failures: [] },
    followUpQuestions: [],
    recommendedNextAction: null,
    learningPathDraft: null,
    relatedCards: [],
    knowledgeSources: [],
  };
}

beforeEach(() => {
  memoryStore.clear();
});

describe("turnLog", () => {
  it("is enabled by default and records assistant turns with their signals", () => {
    expect(isTurnLogEnabled()).toBe(true);
    logAssistantTurn({ source: "chat_assistant", userText: "할 게 너무 많아", turn: fakeTurn("t1"), outcomeId: "o1" });

    const entries = loadTurnLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "t1",
      source: "chat_assistant",
      userText: "할 게 너무 많아",
      responseMode: "overwhelm",
      stage: "scoping",
      domains: ["language learning", "thesis"],
      outcomeId: "o1",
      provider: "llama-server",
    });
    expect(entries[0].inputSignals?.decisionSignal).toBe("strong");
  });

  it("records free-chat turns without assistant metadata", () => {
    logFreeChatTurn({ userText: "안녕", assistantText: "안녕하세요", provider: "llama-server" });
    const [entry] = loadTurnLog();
    expect(entry.source).toBe("chat_free");
    expect(entry.responseMode).toBeUndefined();
    expect(entry.inputSignals).toBeUndefined();
  });

  it("does not record anything while disabled, and re-enables cleanly", () => {
    setTurnLogEnabled(false);
    expect(isTurnLogEnabled()).toBe(false);
    logFreeChatTurn({ userText: "안녕", assistantText: "hi" });
    expect(turnLogCount()).toBe(0);

    setTurnLogEnabled(true);
    logFreeChatTurn({ userText: "안녕", assistantText: "hi" });
    expect(turnLogCount()).toBe(1);
  });

  it("clips long texts so the blob stays bounded", () => {
    logFreeChatTurn({ userText: "가".repeat(3000), assistantText: "나".repeat(3000) });
    const [entry] = loadTurnLog();
    expect(entry.userText.length).toBeLessThanOrEqual(2001);
    expect(entry.assistantText.length).toBeLessThanOrEqual(1201);
  });

  it("keeps only the newest 200 entries", () => {
    for (let i = 0; i < 205; i += 1) {
      logFreeChatTurn({ userText: `msg-${i}`, assistantText: "" });
    }
    expect(turnLogCount()).toBe(200);
  });

  it("clearTurnLog empties the log without touching the enabled flag", () => {
    logFreeChatTurn({ userText: "안녕", assistantText: "hi" });
    clearTurnLog();
    expect(turnLogCount()).toBe(0);
    expect(isTurnLogEnabled()).toBe(true);
  });

  it("survives a corrupted blob", () => {
    memoryStore.set("focusflow.aiTurnLog.v1", "{not json");
    expect(loadTurnLog()).toEqual([]);
  });
});
