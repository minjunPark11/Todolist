// Structured render of one AssistantTurn: card draft + next action + plan +
// learning path + related cards, with the user-confirmed save/link buttons.
// Extracted from AssistantPanel (Unified Chat slice 1) so the chat tab can
// render the same cards inline instead of flattening the turn to text.
//
// Per-turn action state (saved card, saved task, rejection, path link) lives
// HERE — hosts must mount it with key={turn.id} so a new turn resets it.
// Nothing in this component changes app data without a button click.
import { useMemo, useState } from "react";
import type { AgentAction } from "../../lib/ai/agent/actions";
import type { AssistantTurn } from "../../lib/ai/assistant/types";
import { loadContextCards, saveContextCard } from "../../lib/ai/contextCards/store";
import { summarizeContextCardForPrompt } from "../../lib/ai/contextCards/searchContextCards";
import type { ContextCard, RecommendedNextAction } from "../../lib/ai/contextCards/types";
import { suggestMilestoneForCard } from "../../lib/ai/learningPaths/matchMilestone";
import { currentMilestoneIndex, formatBreadcrumb, milestoneIndexForCard } from "../../lib/ai/learningPaths/progress";
import { linkCardToMilestone, loadLearningPaths, saveLearningPath } from "../../lib/ai/learningPaths/store";
import type { LearningPath, LearningPathDraft } from "../../lib/ai/learningPaths/types";
import { updateOutcome } from "../../lib/ai/memory/outcomeLog";
import type { ToolExecutionResult } from "../../lib/ai/tools/toolExecutor";
import { useT } from "../../i18n";

interface AssistantTurnCardsProps {
  turn: AssistantTurn;
  // Outcome-log entry created by the host when the turn surfaced; the
  // buttons below move it to saved_as_task / rejected / failed.
  outcomeId?: string;
  loading?: boolean;
  onExecuteActions?: (actions: AgentAction[]) => ToolExecutionResult[];
  // "더 작게 쪼개줘" / "다른 행동" requests — the host decides how to send
  // them (the chat tab must force the assistant flow, not the free-text
  // agent). Buttons hidden when absent.
  onFollowUpRequest?: (text: string) => void;
  // Fired after a path save/link so hosts with a breadcrumb can refresh it.
  onPathsChanged?: () => void;
  // Render the deterministic position line ("지금 …의 N/M …") above the
  // cards. The assistant panel keeps its own copy inside the reply bubble,
  // so it passes false; the chat tab passes true.
  showPositionLine?: boolean;
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

export function AssistantTurnCards({
  turn,
  outcomeId,
  loading,
  onExecuteActions,
  onFollowUpRequest,
  onPathsChanged,
  showPositionLine,
}: AssistantTurnCardsProps) {
  const { t } = useT();
  // Per-proposal state — reset by the host remounting with key={turn.id}.
  const [savedCard, setSavedCard] = useState<ContextCard | null>(null);
  const [savedTaskTitle, setSavedTaskTitle] = useState("");
  const [rejected, setRejected] = useState(false);
  const [notice, setNotice] = useState("");
  const [showRelatedCards, setShowRelatedCards] = useState(false);
  const [savedPath, setSavedPath] = useState<LearningPath | null>(null);
  // Milestone the saved card of THIS turn was linked to ("" = not linked).
  const [linkedMilestoneTitle, setLinkedMilestoneTitle] = useState("");
  // Most recently updated path — drives the link suggestion, rolling-wave
  // render, and (in the chat tab) the position line. All position math lives
  // in learningPaths/progress.
  const [activePath, setActivePath] = useState<LearningPath | null>(() => loadLearningPaths()[0] ?? null);
  const pathView = useMemo(() => {
    if (!activePath) return null;
    const cards = loadContextCards();
    return {
      breadcrumb: formatBreadcrumb(activePath, cards),
      currentIndex: currentMilestoneIndex(activePath, cards),
    };
  }, [activePath]);

  function handleSaveCard() {
    if (savedCard) return;
    const card = saveContextCard(turn.contextCardDraft, "brain_dump");
    setSavedCard(card);
    if (outcomeId) updateOutcome(outcomeId, { contextCardId: card.id });
  }

  // The next action is only ever added to the task list — the assistant
  // never starts a focus session itself. Execution timing stays the user's
  // call, made from the task list/focus page like any other task.
  function handleSaveTask(nextAction: RecommendedNextAction) {
    if (savedTaskTitle || rejected) return;
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
    if (savedPath) return;
    const path = saveLearningPath(pathDraft, "assistant");
    setSavedPath(path);
    setActivePath(path);
    onPathsChanged?.();
  }

  // Deterministic link suggestion (matchMilestone.ts) once the card is
  // saved: one milestone, one confirm click — never auto-linked (decision
  // 2026-07-09).
  const linkSuggestion = useMemo(
    () => (savedCard && activePath && !linkedMilestoneTitle ? suggestMilestoneForCard(activePath, savedCard, loadContextCards()) : null),
    [savedCard, activePath, linkedMilestoneTitle],
  );

  function handleLinkCard() {
    if (!savedCard || !activePath || !linkSuggestion) return;
    const updated = linkCardToMilestone(activePath.id, linkSuggestion.milestone.id, savedCard.id);
    if (updated) {
      setActivePath(updated);
      setLinkedMilestoneTitle(linkSuggestion.milestone.title);
      onPathsChanged?.();
    }
  }

  function handleReject() {
    if (savedTaskTitle || rejected) return;
    setRejected(true);
    if (outcomeId) updateOutcome(outcomeId, { status: "rejected", contextCardId: savedCard?.id });
  }

  const cardDraft = turn.contextCardDraft;
  const nextAction = turn.recommendedNextAction;

  // Direct-answer turns (domain_specific/learning_request) are a plain reply —
  // the host already rendered the text bubble, so there are no cards to show.
  if (turn.isDirectAnswer) return null;

  return (
    <div className="assistant-turn-cards">
      {showPositionLine && pathView?.breadcrumb ? (
        <p className="assistant-path-position">
          {t("ai.assistant.path.position", {
            goal: pathView.breadcrumb.goal,
            position: pathView.breadcrumb.position,
            milestone: pathView.breadcrumb.milestoneTitle,
          })}
        </p>
      ) : null}

      {turn.followUpQuestions.length > 0 ? (
        <section className="assistant-section" aria-label={t("ai.assistant.followUps")}>
          <h3>{t("ai.assistant.needsMoreContext")}</h3>
          <p className="assistant-hint">{t("ai.assistant.followUps")}</p>
          <ol className="assistant-questions">
            {turn.followUpQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ol>
        </section>
      ) : null}

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
          {savedCard && activePath && (linkSuggestion || linkedMilestoneTitle) ? (
            <button type="button" onClick={handleLinkCard} disabled={Boolean(linkedMilestoneTitle)}>
              {linkedMilestoneTitle
                ? `✓ ${t("ai.assistant.path.linked", { milestone: linkedMilestoneTitle })}`
                : `🧭 ${t("ai.assistant.path.linkSuggest", { milestone: linkSuggestion?.milestone.title ?? "" })}`}
            </button>
          ) : null}
        </div>
      </section>

      {nextAction ? (
        <section className="assistant-section assistant-next-action" aria-label={t("ai.assistant.nextAction")}>
          <h3>{t("ai.assistant.nextAction")}</h3>
          <p className="assistant-card-title">{nextAction.title}</p>
          {cardDraft.plan?.[0]?.startCue ? (
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
            {onFollowUpRequest ? (
              <>
                <button type="button" onClick={() => onFollowUpRequest(t("ai.assistant.splitSmallerRequest"))} disabled={loading}>
                  {t("ai.assistant.splitSmaller")}
                </button>
                <button type="button" onClick={() => onFollowUpRequest(t("ai.assistant.anotherActionRequest"))} disabled={loading}>
                  {t("ai.assistant.anotherAction")}
                </button>
              </>
            ) : null}
            <button type="button" disabled title={t("ai.assistant.comingSoon")}>
              {t("ai.assistant.startFocus")} · {t("ai.assistant.comingSoon")}
            </button>
          </div>
        </section>
      ) : null}

      {cardDraft.plan && cardDraft.plan.length > 1 ? (
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
              {turn.relatedCards.map((card) => {
                // Rolling wave (slice B): only cards on the path's current
                // milestone expand to full detail — cards parked on later
                // milestones render title-only.
                const milestoneIndex = activePath ? milestoneIndexForCard(activePath, card.id) : null;
                const parked = activePath && pathView && milestoneIndex !== null && milestoneIndex !== pathView.currentIndex;
                if (parked) {
                  return (
                    <p key={card.id} className="assistant-related-card assistant-related-card-parked">
                      {card.title} · {t("ai.assistant.path.laterMilestone", { milestone: activePath.milestones[milestoneIndex].title })}
                    </p>
                  );
                }
                return (
                  <pre key={card.id} className="assistant-related-card">
                    {summarizeContextCardForPrompt(card)}
                  </pre>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {notice ? <div className="ollama-chat-notice">{notice}</div> : null}
    </div>
  );
}
