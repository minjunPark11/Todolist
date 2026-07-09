import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { AI_SAFE_ACTION_DEFAULT_RISK } from "../../lib/ai/actions/types";
import type { AgentAction } from "../../lib/ai/agent/actions";
import { runAssistantTurn } from "../../lib/ai/assistant/runAssistantTurn";
import type { AssistantTurn } from "../../lib/ai/assistant/types";
import type { AiContextInput } from "../../lib/ai/context/buildAiContext";
import { loadContextCards, saveContextCard } from "../../lib/ai/contextCards/store";
import { summarizeContextCardForPrompt } from "../../lib/ai/contextCards/searchContextCards";
import type { ContextCard, RecommendedNextAction } from "../../lib/ai/contextCards/types";
import { formatBreadcrumb, type PathBreadcrumb } from "../../lib/ai/learningPaths/progress";
import { loadLearningPaths, saveLearningPath } from "../../lib/ai/learningPaths/store";
import type { LearningPath, LearningPathDraft } from "../../lib/ai/learningPaths/types";
import { logProposedOutcome, updateOutcome } from "../../lib/ai/memory/outcomeLog";
import type { ToolExecutionResult } from "../../lib/ai/tools/toolExecutor";
import type { AiMessage } from "../../lib/ai/types";
import type { KnowledgeSettings } from "../../lib/knowledge/types";
import { useT } from "../../i18n";

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

function Chips({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="assistant-field">
      <span className="assistant-field-label">{label}</span>
      <div className="assistant-chips">
        {values.map((value, index) => (
          <span key={`${value}-${index}`} className="assistant-chip">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AssistantPanel({ aiContext, knowledgeSettings, onExecuteActions }: AssistantPanelProps) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const [exchanges, setExchanges] = useState<PanelExchange[]>([]);
  const [turn, setTurn] = useState<AssistantTurn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Per-proposal state, reset on each new turn.
  const [savedCard, setSavedCard] = useState<ContextCard | null>(null);
  const [outcomeId, setOutcomeId] = useState("");
  const [savedTaskTitle, setSavedTaskTitle] = useState("");
  const [rejected, setRejected] = useState(false);
  const [notice, setNotice] = useState("");
  const [showRelatedCards, setShowRelatedCards] = useState(false);
  const [savedPath, setSavedPath] = useState<LearningPath | null>(null);
  // Position line for the most recently updated path (learningPaths/progress
  // is the single source — the panel never derives position itself).
  const [breadcrumb, setBreadcrumb] = useState<PathBreadcrumb | null>(() => {
    const latest = loadLearningPaths()[0];
    return latest ? formatBreadcrumb(latest, loadContextCards()) : null;
  });
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
    setNotice("");
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
      const assistantText = [
        nextTurn.userFacingText,
        `[draft] ${JSON.stringify({
          title: nextTurn.contextCardDraft.title,
          detected_items: nextTurn.contextCardDraft.detectedItems,
          missing_info: nextTurn.contextCardDraft.missingInfo,
          stage: nextTurn.contextCardDraft.stage,
          info_slots: (nextTurn.contextCardDraft.infoSlots ?? []).map((slot) => ({
            kind: slot.kind,
            answer: slot.answer,
            source: slot.source,
          })),
        })}`,
      ].join("\n");
      setExchanges((current) => [...current, { id: nextTurn.id, userText: content, assistantText }]);
      setTurn(nextTurn);
      setDraft("");
      setSavedCard(null);
      setSavedTaskTitle("");
      setRejected(false);
      setShowRelatedCards(false);
      setSavedPath(null);

      // Every surfaced proposal starts as "proposed" in the outcome log; the
      // buttons below move it to saved_as_task / rejected / failed.
      if (nextTurn.recommendedNextAction) {
        const entry = logProposedOutcome({
          assistantTurnId: nextTurn.id,
          proposedAction: {
            id: `safe-${nextTurn.id}`,
            type: "create_task",
            label: nextTurn.recommendedNextAction.title,
            risk: AI_SAFE_ACTION_DEFAULT_RISK.create_task,
            payload: { title: nextTurn.recommendedNextAction.title },
          },
        });
        setOutcomeId(entry.id);
      } else {
        setOutcomeId("");
      }
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

  function handleSaveCard() {
    if (!turn || savedCard) return;
    const card = saveContextCard(turn.contextCardDraft, "brain_dump");
    setSavedCard(card);
    if (outcomeId) updateOutcome(outcomeId, { contextCardId: card.id });
  }

  // The next action is only ever added to the task list — the assistant
  // never starts a focus session itself. Execution timing stays the user's
  // call, made from the task list/focus page like any other task.
  function handleSaveTask(nextAction: RecommendedNextAction) {
    if (!turn || savedTaskTitle || rejected) return;
    if (!onExecuteActions) {
      setNotice(t("ai.notice.executorNotConnected"));
      return;
    }

    const noteLines = [
      nextAction.completionCriteria ? `${t("ai.assistant.completionCriteria")}: ${nextAction.completionCriteria}` : "",
      nextAction.reason ? `${t("ai.assistant.reason")}: ${nextAction.reason}` : "",
      "source: ai_assistant",
      savedCard ? `contextCard: ${savedCard.id}` : "",
    ].filter(Boolean);

    const action: AgentAction = {
      id: `assistant-create-${turn.id}`,
      type: "create_task",
      label: nextAction.title,
      risk: "low",
      payload: {
        title: nextAction.title,
        projectId: turn.contextCardDraft.relatedProjectIds[0] || undefined,
        notes: noteLines.join("\n"),
        tags: ["ai-assistant"],
      },
    };

    const [result] = onExecuteActions([action]);
    if (result?.ok) {
      setSavedTaskTitle(nextAction.title);
      if (outcomeId) {
        updateOutcome(outcomeId, {
          status: "saved_as_task",
          savedTaskId: result.taskId,
          contextCardId: savedCard?.id,
        });
      }
    } else {
      setNotice(t("ai.assistant.taskSaveFailed", { message: result?.message ?? "" }));
      if (outcomeId) updateOutcome(outcomeId, { status: "failed" });
    }
  }

  function handleSavePath(pathDraft: LearningPathDraft) {
    if (!turn || savedPath) return;
    const path = saveLearningPath(pathDraft, "assistant");
    setSavedPath(path);
    setBreadcrumb(formatBreadcrumb(path, loadContextCards()));
  }

  function handleReject() {
    if (!turn || savedTaskTitle || rejected) return;
    setRejected(true);
    if (outcomeId) updateOutcome(outcomeId, { status: "rejected", contextCardId: savedCard?.id });
  }

  const cardDraft = turn?.contextCardDraft;
  const nextAction = turn?.recommendedNextAction ?? null;

  return (
    <div className="assistant-panel">
      {breadcrumb ? (
        <div className="assistant-breadcrumb" title={t("ai.assistant.path.breadcrumbLabel")}>
          🧭 {breadcrumb.goal} · {breadcrumb.position} {breadcrumb.milestoneTitle}
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
            {/* The structured panels below render the last turn; older turns
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
              <p>{turn.userFacingText}</p>
            </div>

            {turn.followUpQuestions.length > 0 ? (
              <section className="assistant-section" aria-label={t("ai.assistant.followUps")}>
                <h3>
                  {t("ai.assistant.needsMoreContext")}
                </h3>
                <p className="assistant-hint">{t("ai.assistant.followUps")}</p>
                <ol className="assistant-questions">
                  {turn.followUpQuestions.map((question, index) => (
                    <li key={index}>{question}</li>
                  ))}
                </ol>
              </section>
            ) : null}

            {cardDraft ? (
              <section className="assistant-section" aria-label={t("ai.assistant.cardDraft")}>
                <h3>{t("ai.assistant.cardDraft")}</h3>
                {turn.usedFallbackDraft ? <p className="assistant-hint">{t("ai.assistant.fallbackDraftNote")}</p> : null}
                <p className="assistant-card-title">
                  {cardDraft.title}
                  {cardDraft.stage ? <span className="assistant-chip">{t(`ai.assistant.stage.${cardDraft.stage}`)}</span> : null}
                </p>
                <Chips label={t("ai.assistant.detectedItems")} values={cardDraft.detectedItems} />
                <Chips label={t("ai.assistant.inferredDomains")} values={cardDraft.inferredDomains} />
                <Chips label={t("ai.assistant.workTypes")} values={cardDraft.workTypes} />
                <Chips label={t("ai.assistant.currentStatus")} values={cardDraft.currentStatus} />
                <Chips label={t("ai.assistant.likelyBlockers")} values={cardDraft.likelyBlockers} />
                <Chips label={t("ai.assistant.missingInfo")} values={cardDraft.missingInfo} />
                {cardDraft.infoSlots && cardDraft.infoSlots.length > 0 ? (
                  <div className="assistant-field">
                    <span className="assistant-field-label">{t("ai.assistant.infoSlots")}</span>
                    <ul className="assistant-info-slots">
                      {cardDraft.infoSlots.map((slot) => (
                        <li key={slot.kind} className={slot.answer.trim() ? "assistant-info-slot resolved" : "assistant-info-slot"}>
                          {slot.answer.trim() ? `✓ ${t(`ai.assistant.slot.${slot.kind}`)}: ${slot.answer}` : `○ ${slot.question}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Chips label={t("ai.assistant.possibleOutputs")} values={cardDraft.possibleOutputs} />
                <Chips label={t("ai.assistant.relatedNotes")} values={cardDraft.relatedNotePaths} />
                <div className="assistant-actions">
                  <button type="button" className="assistant-primary" onClick={handleSaveCard} disabled={Boolean(savedCard)}>
                    {savedCard ? t("ai.assistant.cardSaved") : t("ai.assistant.saveCard")}
                  </button>
                </div>
              </section>
            ) : null}

            {nextAction ? (
              <section className="assistant-section assistant-next-action" aria-label={t("ai.assistant.nextAction")}>
                <h3>{t("ai.assistant.nextAction")}</h3>
                <p className="assistant-card-title">{nextAction.title}</p>
                {cardDraft?.plan?.[0]?.startCue ? (
                  <p className="assistant-detail">
                    <strong>{t("ai.assistant.planStartCue")}:</strong> {cardDraft.plan[0].startCue}
                  </p>
                ) : null}
                {nextAction.completionCriteria ? (
                  <p className="assistant-detail">
                    <strong>{t("ai.assistant.completionCriteria")}:</strong> {nextAction.completionCriteria}
                  </p>
                ) : null}
                {nextAction.estimatedDifficulty ? (
                  <span className="assistant-chip">{t(`ai.assistant.difficulty.${nextAction.estimatedDifficulty}`)}</span>
                ) : null}

                <p className="assistant-status">
                  {savedTaskTitle
                    ? `✓ ${t("ai.assistant.taskSaved", { title: savedTaskTitle })}`
                    : rejected
                      ? t("ai.assistant.rejected")
                      : t("ai.assistant.statusProposed")}
                </p>

                <div className="assistant-actions">
                  <button
                    type="button"
                    className="assistant-primary"
                    onClick={() => handleSaveTask(nextAction)}
                    disabled={Boolean(savedTaskTitle) || rejected}
                  >
                    {t("ai.assistant.saveTask")}
                  </button>
                  <button type="button" onClick={handleReject} disabled={Boolean(savedTaskTitle) || rejected}>
                    {t("ai.assistant.reject")}
                  </button>
                  <button type="button" onClick={() => void analyze(t("ai.assistant.splitSmallerRequest"))} disabled={loading}>
                    {t("ai.assistant.splitSmaller")}
                  </button>
                  <button type="button" onClick={() => void analyze(t("ai.assistant.anotherActionRequest"))} disabled={loading}>
                    {t("ai.assistant.anotherAction")}
                  </button>
                  <button type="button" disabled title={t("ai.assistant.comingSoon")}>
                    {t("ai.assistant.startFocus")} · {t("ai.assistant.comingSoon")}
                  </button>
                </div>
              </section>
            ) : null}

            {cardDraft?.plan && cardDraft.plan.length > 1 ? (
              <section className="assistant-section" aria-label={t("ai.assistant.planUpcoming")}>
                <h3>{t("ai.assistant.planUpcoming")}</h3>
                <p className="assistant-hint">{t("ai.assistant.planHint")}</p>
                <ol className="assistant-plan-steps">
                  {cardDraft.plan.slice(1).map((step, index) => (
                    <li key={index} className="assistant-plan-step">
                      <p className="assistant-plan-step-title">{step.title}</p>
                      {step.why ? <p className="assistant-plan-step-why">{step.why}</p> : null}
                      <p className="assistant-plan-step-meta">
                        {t("ai.assistant.planStartCue")}: {step.startCue}
                        {step.completionCriteria ? ` · ${t("ai.assistant.planDoneCue")}: ${step.completionCriteria}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {turn.learningPathDraft ? (
              <section className="assistant-section assistant-path" aria-label={t("ai.assistant.path.draftTitle")}>
                <h3>{t("ai.assistant.path.draftTitle")}</h3>
                <p className="assistant-hint">{t("ai.assistant.path.hint")}</p>
                <p className="assistant-card-title">{turn.learningPathDraft.goal}</p>
                <ol className="assistant-plan-steps">
                  {turn.learningPathDraft.milestones.map((milestone) => (
                    <li key={milestone.id} className="assistant-plan-step">
                      <p className="assistant-plan-step-title">{milestone.title}</p>
                      <p className="assistant-plan-step-meta">
                        {t("ai.assistant.path.milestoneDone")}: {milestone.doneCriteria}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="assistant-actions">
                  <button
                    type="button"
                    className="assistant-primary"
                    onClick={() => turn.learningPathDraft && handleSavePath(turn.learningPathDraft)}
                    disabled={Boolean(savedPath)}
                  >
                    {savedPath ? t("ai.assistant.path.saved") : t("ai.assistant.path.save")}
                  </button>
                </div>
              </section>
            ) : null}

            {turn.relatedCards.length > 0 ? (
              <section className="assistant-section" aria-label={t("ai.assistant.showRelatedCards", { n: turn.relatedCards.length })}>
                <button type="button" className="assistant-toggle" onClick={() => setShowRelatedCards((value) => !value)}>
                  {t("ai.assistant.showRelatedCards", { n: turn.relatedCards.length })} {showRelatedCards ? "▾" : "▸"}
                </button>
                {showRelatedCards ? (
                  <div className="assistant-related-cards">
                    {turn.relatedCards.map((card) => (
                      <pre key={card.id} className="assistant-related-card">
                        {summarizeContextCardForPrompt(card)}
                      </pre>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {notice ? <div className="ollama-chat-notice">{notice}</div> : null}
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
