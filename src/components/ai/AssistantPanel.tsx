import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { AI_SAFE_ACTION_DEFAULT_RISK } from "../../lib/ai/actions/types";
import type { AgentAction } from "../../lib/ai/agent/actions";
import { buildAssistantHistoryText } from "../../lib/ai/assistant/historyEcho";
import { runAssistantTurn } from "../../lib/ai/assistant/runAssistantTurn";
import type { AssistantTurn } from "../../lib/ai/assistant/types";
import type { AiContextInput } from "../../lib/ai/context/buildAiContext";
import { loadContextCards } from "../../lib/ai/contextCards/store";
import { currentMilestoneIndex, formatBreadcrumb } from "../../lib/ai/learningPaths/progress";
import { loadLearningPaths } from "../../lib/ai/learningPaths/store";
import type { LearningPath } from "../../lib/ai/learningPaths/types";
import { logProposedOutcome } from "../../lib/ai/memory/outcomeLog";
import { logAssistantTurn } from "../../lib/ai/memory/turnLog";
import type { ToolExecutionResult } from "../../lib/ai/tools/toolExecutor";
import type { AiMessage } from "../../lib/ai/types";
import type { KnowledgeSettings } from "../../lib/knowledge/types";
import { useT } from "../../i18n";
import { AssistantTurnCards } from "./AssistantTurnCards";

// One completed dump→analysis exchange kept for display and model history.
type PanelExchange = {
  id: string;
  userText: string;
  assistantText: string;
};

interface AssistantPanelProps {
  aiContext?: Omit<AiContextInput, "calendarContextText">;
  knowledgeSettings?: KnowledgeSettings;
  onExecuteActions?: (actions: AgentAction[]) => ToolExecutionResult[];
}

export function AssistantPanel({ aiContext, knowledgeSettings, onExecuteActions }: AssistantPanelProps) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const [exchanges, setExchanges] = useState<PanelExchange[]>([]);
  const [turn, setTurn] = useState<AssistantTurn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [outcomeId, setOutcomeId] = useState("");
  // The path the breadcrumb/position line follows: most recently updated.
  // All position math lives in learningPaths/progress — the panel never
  // derives position on its own. Per-turn action state (save/link buttons)
  // lives in AssistantTurnCards, remounted per turn via key={turn.id}.
  const [activePath, setActivePath] = useState<LearningPath | null>(() => loadLearningPaths()[0] ?? null);
  const pathView = useMemo(() => {
    if (!activePath) return null;
    const cards = loadContextCards();
    return {
      breadcrumb: formatBreadcrumb(activePath, cards),
      currentIndex: currentMilestoneIndex(activePath, cards),
    };
  }, [activePath]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Prior exchanges as chat history so follow-up answers refine the draft.
  function buildHistory(): AiMessage[] {
    return exchanges.flatMap((exchange) => [
      { role: "user" as const, content: exchange.userText },
      { role: "assistant" as const, content: exchange.assistantText },
    ]);
  }

  async function analyze(text: string) {
    const content = text.trim();
    if (!content || loading || !aiContext) return;

    setLoading(true);
    setError("");
    try {
      const nextTurn = await runAssistantTurn({
        brainDump: content,
        history: buildHistory().slice(-8),
        appData: aiContext,
        knowledgeSettings,
      });

      // Keep a compact draft echo in the assistant history message so the
      // next turn's model sees what it already structured — including which
      // info slots are already answered, so it never re-asks them.
      setExchanges((current) => [...current, { id: nextTurn.id, userText: content, assistantText: buildAssistantHistoryText(nextTurn) }]);
      setTurn(nextTurn);
      setDraft("");

      // Every surfaced proposal starts as "proposed" in the outcome log; the
      // buttons in AssistantTurnCards move it to saved_as_task / rejected /
      // failed.
      let entryId = "";
      if (nextTurn.recommendedNextAction) {
        entryId = logProposedOutcome({
          assistantTurnId: nextTurn.id,
          proposedAction: {
            id: `safe-${nextTurn.id}`,
            type: "create_task",
            label: nextTurn.recommendedNextAction.title,
            risk: AI_SAFE_ACTION_DEFAULT_RISK.create_task,
            payload: { title: nextTurn.recommendedNextAction.title },
          },
        }).id;
      }
      setOutcomeId(entryId);

      // Turn log (User Patterns slice A): persist the exchange + its signals
      // for later pattern analysis. Best-effort, honors the settings toggle.
      logAssistantTurn({ source: "assistant_panel", userText: content, turn: nextTurn, outcomeId: entryId || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ai.assistant.error"));
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    void analyze(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void analyze(draft);
    }
  }

  return (
    <div className="assistant-panel">
      {pathView?.breadcrumb ? (
        <div className="assistant-breadcrumb" title={t("ai.assistant.path.breadcrumbLabel")}>
          🧭 {pathView.breadcrumb.goal} · {pathView.breadcrumb.position} {pathView.breadcrumb.milestoneTitle}
        </div>
      ) : null}
      <div className="assistant-scroll" role="log" aria-live="polite">
        {exchanges.length === 0 && !loading ? (
          <p className="assistant-greeting">{t("ai.assistant.greeting")}</p>
        ) : null}

        {exchanges.map((exchange) => (
          <div key={exchange.id} className="assistant-exchange">
            <div className="ollama-chat-message user">
              <span>{t("ai.assistant.youLabel")}</span>
              <p>{exchange.userText}</p>
            </div>
            {/* The structured cards below render the last turn; older turns
                only keep the user-facing sentence. */}
            {turn && exchange.id === turn.id ? null : (
              <div className="ollama-chat-message assistant">
                <span>{t("ai.assistant.aiLabel")}</span>
                <p>{exchange.assistantText.split("\n[draft]")[0]}</p>
              </div>
            )}
          </div>
        ))}

        {loading ? (
          <div className="ollama-chat-message assistant">
            <span>{t("ai.assistant.aiLabel")}</span>
            <p>{t("ai.assistant.thinking")}</p>
          </div>
        ) : null}

        {error ? <div className="ollama-chat-error">{error}</div> : null}

        {turn && !loading ? (
          <>
            <div className="ollama-chat-message assistant">
              <span>{t("ai.assistant.aiLabel")}</span>
              {/* Position line (slice B): one deterministic sentence before
                  the body — built from progress.ts, never from the model. */}
              {pathView?.breadcrumb ? (
                <p className="assistant-path-position">
                  {t("ai.assistant.path.position", {
                    goal: pathView.breadcrumb.goal,
                    position: pathView.breadcrumb.position,
                    milestone: pathView.breadcrumb.milestoneTitle,
                  })}
                </p>
              ) : null}
              <p>{turn.userFacingText}</p>
            </div>

            <AssistantTurnCards
              key={turn.id}
              turn={turn}
              outcomeId={outcomeId}
              loading={loading}
              onExecuteActions={onExecuteActions}
              onFollowUpRequest={(text) => void analyze(text)}
              onPathsChanged={() => setActivePath(loadLearningPaths()[0] ?? null)}
            />
          </>
        ) : null}
      </div>

      <form className="ollama-chat-form" onSubmit={submit}>
        <textarea
          ref={inputRef}
          value={draft}
          rows={3}
          placeholder={t("ai.assistant.inputPlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" disabled={!draft.trim() || loading || !aiContext}>
          {t("ai.assistant.analyze")}
        </button>
      </form>
    </div>
  );
}
