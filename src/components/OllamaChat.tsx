import { FormEvent, Fragment, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AgentActionPreview } from "./ai/AgentActionPreview";
import { AssistantPanel } from "./ai/AssistantPanel";
import { AssistantTurnCards } from "./ai/AssistantTurnCards";
import { AI_SAFE_ACTION_DEFAULT_RISK } from "../lib/ai/actions/types";
import type { AgentAction } from "../lib/ai/agent/actions";
import { detectAgentIntent, getIntentLabel, type AgentIntent } from "../lib/ai/agent/intent";
import { buildAssistantHistoryText } from "../lib/ai/assistant/historyEcho";
import { runAssistantTurn } from "../lib/ai/assistant/runAssistantTurn";
import type { AssistantTurn } from "../lib/ai/assistant/types";
import { logProposedOutcome } from "../lib/ai/memory/outcomeLog";
import { logAssistantTurn } from "../lib/ai/memory/turnLog";
import type { AiContextInput } from "../lib/ai/context/buildAiContext";
import type { ToolExecutionResult, ToolValidationResult } from "../lib/ai/tools/toolExecutor";
import type { AiMessage, AiProviderName } from "../lib/ai/types";
import { buildCalendarContextText, type CalendarContextInput } from "../lib/calendarContext";
import { Popover } from "./kit";
import { buildAttachedFilesContext, type AttachedFileRef } from "../lib/knowledge/attachedFilesContext";
import { scanVault } from "../lib/knowledge/obsidianScanner";
import { DEFAULT_KNOWLEDGE_SETTINGS, type KnowledgeSettings, type RetrievedChunk } from "../lib/knowledge/types";
import { platform } from "../platform";
import type { PlatformFileEntry } from "../platform/types";
import type { PageId } from "../types";
import { useT } from "../i18n";
import { reducedTransition, transitions } from "../motion/transitions";
import { modalVariants } from "../motion/variants";
import { useMotionEnabled } from "../motion/reducedMotion";

type ChatMessage = AiMessage & {
  id: string;
  // Assistant-flow turn behind this message (Unified Chat slice 1): when
  // present, the structured cards render inline below the bubble instead of
  // being flattened into the text.
  turn?: AssistantTurn;
  // Outcome-log entry for the turn's proposal; the cards' buttons update it.
  outcomeId?: string;
  // What the model sees as this message in later turns (draft echo included)
  // — falls back to `content` when absent.
  historyContent?: string;
};

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
  };
}

interface OllamaChatProps {
  activePage?: PageId;
  calendarContext?: CalendarContextInput;
  aiContext?: Omit<AiContextInput, "calendarContextText">;
  onExecuteActions?: (actions: AgentAction[]) => ToolExecutionResult[];
  knowledgeSettings?: KnowledgeSettings;
}

function getProviderLabel(t: (key: string) => string, provider?: AiProviderName) {
  if (provider === "server") return t("ai.provider.server");
  if (provider === "llama-server") return t("ai.provider.localAi");
  return t("ai.provider.localFirst");
}

export function OllamaChat({
  activePage,
  calendarContext,
  aiContext,
  onExecuteActions,
  knowledgeSettings = DEFAULT_KNOWLEDGE_SETTINGS,
}: OllamaChatProps = {}) {
  const { t } = useT();
  const motionEnabled = useMotionEnabled();
  const [open, setOpen] = useState(false);
  // "chat" = existing read-only chat; "assistant" = brain-dump flow. Both
  // stay mounted (hidden toggle) so switching tabs never loses state.
  const [tab, setTab] = useState<"chat" | "assistant">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage("assistant", t("ai.greeting")),
  ]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<AiProviderName | undefined>();
  const [intent, setIntent] = useState<AgentIntent>("general_chat");
  const [suggestedActions, setSuggestedActions] = useState<AgentAction[]>([]);
  const [validationResults, setValidationResults] = useState<ToolValidationResult[]>([]);
  const [actionNotice, setActionNotice] = useState("");
  const [knowledgeSources, setKnowledgeSources] = useState<RetrievedChunk[]>([]);
  const [copiedSourcePath, setCopiedSourcePath] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileRef[]>([]);
  const [attachPopoverOpen, setAttachPopoverOpen] = useState(false);
  const [attachFilter, setAttachFilter] = useState("");
  const [attachCandidates, setAttachCandidates] = useState<PlatformFileEntry[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canAttachFiles = Boolean(knowledgeSettings.vaultPath) && platform.files.supported();
  const attachMatches = attachCandidates
    .filter((entry) => entry.relativePath.toLowerCase().includes(attachFilter.toLowerCase()))
    .slice(0, 20);

  async function openAttachPopover() {
    setAttachPopoverOpen(true);
    setAttachLoading(true);
    try {
      setAttachCandidates(await scanVault(knowledgeSettings.vaultPath, knowledgeSettings.excludedFolders));
    } catch {
      setAttachCandidates([]);
    } finally {
      setAttachLoading(false);
    }
  }

  function addAttachment(entry: PlatformFileEntry) {
    setAttachedFiles((current) =>
      current.some((file) => file.path === entry.path)
        ? current
        : [...current, { path: entry.path, relativePath: entry.relativePath }],
    );
    setAttachPopoverOpen(false);
    setAttachFilter("");
  }

  function removeAttachment(path: string) {
    setAttachedFiles((current) => current.filter((file) => file.path !== path));
  }

  // Only the recent turns go to the model: the app-data context is rebuilt on
  // every request anyway, and an unbounded history would eventually overflow
  // the local llama-server's context window (--ctx-size in local_ai.rs).
  const chatHistory = useMemo<AiMessage[]>(
    () => messages.slice(-19).map(({ role, content, historyContent }) => ({ role, content: historyContent ?? content })),
    [messages],
  );

  function toggleOpen() {
    setOpen((currentOpen) => {
      const nextOpen = !currentOpen;
      if (nextOpen) {
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      return nextOpen;
    });
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || loading) {
      return;
    }
    const filesToAttach = attachedFiles;
    setDraft("");
    setAttachedFiles([]);
    await send(content, filesToAttach);
  }

  // One chat turn. Unified Chat slice 2: every message goes through the single
  // engine (runAssistantTurn). Its model-side Scope Gate decides whether to
  // answer directly (domain_specific/learning_request → plain bubble) or
  // structure an overwhelm/planning dump (inline cards). The old regex router
  // + free-text personal agent are gone; the Generic Failure Guard now covers
  // every structured turn.
  async function send(content: string, filesToAttach: AttachedFileRef[]) {
    if (!content || loading) {
      return;
    }

    const userMessage = createMessage("user", content);
    setIntent(detectAgentIntent(content));
    setMessages((current) => [...current, userMessage]);
    setError("");
    setActionNotice("");
    setKnowledgeSources([]);
    setLoading(true);

    try {
      if (!aiContext) {
        setError(t("ai.error.chatFailed"));
        return;
      }

      // Attached vault files (📎): user-picked and Obsidian-derived, so they
      // ride the knowledge channel the gateway strips for non-local providers.
      // Best-effort — a failure never blocks the turn.
      let attachedKnowledge: { text: string; sources: RetrievedChunk[] } | undefined;
      try {
        const attachedResult = await buildAttachedFilesContext(filesToAttach, knowledgeSettings.knowledgeBudgetChars);
        if (attachedResult) attachedKnowledge = { text: attachedResult.text, sources: attachedResult.sources };
      } catch {
        // Proceed without the attachment.
      }

      // Calendar page: thread the schedule the assistant pack doesn't carry.
      const calendarContextText =
        activePage === "calendar" && calendarContext ? buildCalendarContextText(calendarContext) : undefined;

      const turn = await runAssistantTurn({
        brainDump: content,
        history: chatHistory,
        appData: aiContext,
        knowledgeSettings,
        attachedKnowledge,
        calendarContextText,
      });
      setProvider(turn.provider);

      // Same outcome-log contract as AssistantPanel: every surfaced proposal
      // starts as "proposed"; the inline cards' buttons move it. Direct-answer
      // turns have no next action, so nothing is logged for them.
      let outcomeId: string | undefined;
      if (turn.recommendedNextAction) {
        outcomeId = logProposedOutcome({
          assistantTurnId: turn.id,
          proposedAction: {
            id: `safe-${turn.id}`,
            type: "create_task",
            label: turn.recommendedNextAction.title,
            risk: AI_SAFE_ACTION_DEFAULT_RISK.create_task,
            payload: { title: turn.recommendedNextAction.title },
          },
        }).id;
      }

      // Turn log (User Patterns slice A): persist the exchange + its signals.
      logAssistantTurn({ source: "chat_assistant", userText: content, turn, outcomeId });

      // Bubble shows only the user-facing text; AssistantTurnCards renders the
      // structure (nothing for direct answers). The model's history keeps the
      // draft echo so follow-up turns refine instead of restarting.
      setMessages((current) => [
        ...current,
        {
          ...createMessage("assistant", turn.userFacingText),
          turn,
          outcomeId,
          historyContent: buildAssistantHistoryText(turn),
        },
      ]);
      setKnowledgeSources(turn.knowledgeSources);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ai.error.chatFailed"));
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function copySourcePath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedSourcePath(path);
      window.setTimeout(() => setCopiedSourcePath(""), 1500);
    } catch {
      // Clipboard API may be unavailable; the chip still shows the path.
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function clearChat() {
    setMessages([createMessage("assistant", t("ai.chatCleared"))]);
    setError("");
    setDraft("");
    setSuggestedActions([]);
    setValidationResults([]);
    setActionNotice("");
    setKnowledgeSources([]);
    setAttachedFiles([]);
    setAttachPopoverOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function dismissActions() {
    setSuggestedActions([]);
    setValidationResults([]);
    setActionNotice(t("ai.notice.dismissed"));
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function requestApplyActions() {
    const hasInvalidAction = validationResults.some((result) => result.status === "invalid");
    if (!onExecuteActions) {
      setActionNotice(t("ai.notice.executorNotConnected"));
      return;
    }
    if (hasInvalidAction) {
      setActionNotice(t("ai.notice.someActionsInvalid"));
      return;
    }

    const results = onExecuteActions(suggestedActions);
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      setActionNotice(t("ai.notice.someActionsFailed", { messages: failed.map((result) => result.message).join(" ") }));
      return;
    }

    setSuggestedActions([]);
    setValidationResults([]);
    setActionNotice(
      results.length === 1
        ? t("ai.notice.actionsAppliedOne")
        : t("ai.notice.actionsAppliedMany", { n: results.length }),
    );
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className={open ? "ollama-chat open" : "ollama-chat"}>
      <AnimatePresence>
      {open ? (
        <motion.section
          className="ollama-chat-panel"
          aria-label={t("ai.panelLabel")}
          style={{ transformOrigin: "bottom right" }}
          variants={motionEnabled ? modalVariants : undefined}
          initial={motionEnabled ? "initial" : false}
          animate={motionEnabled ? "animate" : undefined}
          exit={motionEnabled ? "exit" : undefined}
          transition={motionEnabled ? transitions.soft : reducedTransition}
        >
          <header className="ollama-chat-head">
            <div>
              <span>{getProviderLabel(t, provider)}</span>
              <h2>
                {t("ai.personalAiTitle")}
                {knowledgeSources.length > 0 ? (
                  <span className="ollama-chat-knowledge-badge" title={t("ai.knowledge.badgeHint")} aria-label={t("ai.knowledge.badgeHint")}>
                    📚
                  </span>
                ) : null}
              </h2>
              <small>{getIntentLabel(intent)}</small>
            </div>
            <div className="ollama-chat-actions">
              <button type="button" onClick={clearChat}>{t("ai.clear")}</button>
              <button type="button" aria-label={t("ai.closeChat")} onClick={() => setOpen(false)}>x</button>
            </div>
          </header>

          <div className="ollama-chat-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "chat"}
              className={tab === "chat" ? "active" : ""}
              onClick={() => setTab("chat")}
            >
              {t("ai.tab.chat")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "assistant"}
              className={tab === "assistant" ? "active" : ""}
              onClick={() => setTab("assistant")}
            >
              {t("ai.tab.assistant")}
            </button>
          </div>

          <div className="ollama-chat-mode" hidden={tab !== "assistant"}>
            <AssistantPanel
              aiContext={aiContext}
              knowledgeSettings={knowledgeSettings}
              onExecuteActions={onExecuteActions}
            />
          </div>

          <div className="ollama-chat-mode" hidden={tab !== "chat"}>
          <div className="ollama-chat-messages" role="log" aria-live="polite">
            {messages.map((message) => (
              <Fragment key={message.id}>
                <div className={`ollama-chat-message ${message.role}`}>
                  <span>{message.role === "user" ? t("ai.youLabel") : t("ai.aiLabel")}</span>
                  <p>{message.content}</p>
                </div>
                {/* Assistant-flow turns render their structured cards inline
                    (Unified Chat slice 1) — same save/link buttons as the
                    Assistant tab, keyed by message so state stays per-turn. */}
                {message.turn ? (
                  <AssistantTurnCards
                    key={`cards-${message.id}`}
                    turn={message.turn}
                    outcomeId={message.outcomeId}
                    loading={loading}
                    showPositionLine
                    onExecuteActions={onExecuteActions}
                    onFollowUpRequest={(text) => void send(text, [])}
                  />
                ) : null}
              </Fragment>
            ))}
            {loading ? (
              <div className="ollama-chat-message assistant">
                <span>{t("ai.aiLabel")}</span>
                <p>{t("ai.thinking")}</p>
              </div>
            ) : null}
          </div>

          {error ? <div className="ollama-chat-error">{error}</div> : null}
          {knowledgeSources.length > 0 ? (
            <div className="ollama-chat-knowledge-sources" aria-label={t("ai.knowledge.sourcesLabel")}>
              {knowledgeSources.map((source, index) => (
                <button
                  key={`${source.filePath}-${index}`}
                  type="button"
                  className="ollama-chat-knowledge-chip"
                  title={source.filePath}
                  onClick={() => void copySourcePath(source.filePath)}
                >
                  {copiedSourcePath === source.filePath ? t("ai.knowledge.copied") : source.filePath}
                </button>
              ))}
            </div>
          ) : null}
          {actionNotice ? <div className="ollama-chat-notice">{actionNotice}</div> : null}
          <AgentActionPreview
            actions={suggestedActions}
            validationResults={validationResults}
            canApply={Boolean(onExecuteActions)}
            onDismiss={dismissActions}
            onRequestApply={requestApplyActions}
          />

          {attachedFiles.length > 0 ? (
            <div className="ollama-chat-attachments" aria-label={t("ai.attach.attachedLabel")}>
              {attachedFiles.map((file) => (
                <span key={file.path} className="ollama-chat-attachment-chip" title={file.relativePath}>
                  📎 {file.relativePath}
                  <button type="button" aria-label={t("ai.attach.remove")} onClick={() => removeAttachment(file.path)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <form className="ollama-chat-form" onSubmit={submit}>
            {canAttachFiles ? (
              <div className="ff-anchor ollama-chat-attach-anchor">
                <button
                  type="button"
                  className="ollama-chat-attach-button"
                  aria-label={t("ai.attach.button")}
                  onClick={() => (attachPopoverOpen ? setAttachPopoverOpen(false) : void openAttachPopover())}
                >
                  📎
                </button>
                <Popover open={attachPopoverOpen} onClose={() => setAttachPopoverOpen(false)}>
                  <input
                    type="text"
                    className="ollama-chat-attach-filter"
                    value={attachFilter}
                    placeholder={t("ai.attach.filterPlaceholder")}
                    onChange={(event) => setAttachFilter(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.preventDefault();
                    }}
                    autoFocus
                  />
                  <div className="ollama-chat-attach-list">
                    {attachLoading ? (
                      <div className="ollama-chat-attach-empty">{t("ai.attach.loading")}</div>
                    ) : attachMatches.length ? (
                      attachMatches.map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          className="ff-menu-item"
                          onClick={() => addAttachment(entry)}
                        >
                          {entry.relativePath}
                        </button>
                      ))
                    ) : (
                      <div className="ollama-chat-attach-empty">{t("ai.attach.empty")}</div>
                    )}
                  </div>
                </Popover>
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              value={draft}
              rows={2}
              placeholder={t("ai.messagePlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button type="submit" disabled={!draft.trim() || loading}>{t("ai.send")}</button>
          </form>
          </div>
        </motion.section>
      ) : null}
      </AnimatePresence>

      <button
        type="button"
        className="ollama-chat-fab"
        aria-label={open ? t("ai.closeChat") : t("ai.openChat")}
        aria-expanded={open}
        onClick={toggleOpen}
      >
        {open ? "x" : t("ai.aiLabel")}
      </button>
    </div>
  );
}
