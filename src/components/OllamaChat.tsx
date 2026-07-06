import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AgentActionPreview } from "./ai/AgentActionPreview";
import type { AgentAction } from "../lib/ai/agent/actions";
import { runPersonalAgent } from "../lib/ai/agent/personalAgent";
import { listLocalAiModels } from "../lib/ai/gateway";
import { detectAgentIntent, getIntentLabel, type AgentIntent } from "../lib/ai/agent/intent";
import { buildAiContextText, type AiContextInput } from "../lib/ai/context/buildAiContext";
import {
  validateAgentActions,
  type ToolExecutionResult,
  type ToolValidationResult,
} from "../lib/ai/tools/toolExecutor";
import type { AiMessage, AiProviderName } from "../lib/ai/types";
import { buildCalendarContextText, type CalendarContextInput } from "../lib/calendarContext";
import { Popover } from "./kit";
import { buildAttachedFilesContext, type AttachedFileRef } from "../lib/knowledge/attachedFilesContext";
import { createKnowledgeContextSource } from "../lib/knowledge/knowledgeContextSource";
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
  aiModel?: string;
  onChangeAiModel?: (model: string) => void;
  knowledgeSettings?: KnowledgeSettings;
}

function getProviderLabel(t: (key: string) => string, provider?: AiProviderName) {
  if (provider === "server") return t("ai.provider.server");
  if (provider === "remote-ollama") return t("ai.provider.remoteOllama");
  if (provider === "ollama") return t("ai.provider.localOllama");
  return t("ai.provider.localFirst");
}

export function OllamaChat({
  activePage,
  calendarContext,
  aiContext,
  onExecuteActions,
  aiModel = "",
  onChangeAiModel,
  knowledgeSettings = DEFAULT_KNOWLEDGE_SETTINGS,
}: OllamaChatProps = {}) {
  const { t } = useT();
  const motionEnabled = useMotionEnabled();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
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

  const chatHistory = useMemo<AiMessage[]>(
    () => messages.map(({ role, content }) => ({ role, content })),
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

  async function loadModels() {
    setModelsLoading(true);
    try {
      setModels(await listLocalAiModels());
    } finally {
      setModelsLoading(false);
    }
  }

  // Refresh the installed-model list whenever the panel opens, so the dropdown
  // reflects what Ollama currently has (and an empty list flags it as offline).
  useEffect(() => {
    if (open) {
      void loadModels();
    }
  }, [open]);

  const isOffline = open && !modelsLoading && models.length === 0;

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || loading) {
      return;
    }

    const userMessage = createMessage("user", content);
    const nextIntent = detectAgentIntent(content);
    const filesToAttach = attachedFiles;
    setIntent(nextIntent);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setAttachedFiles([]);
    setError("");
    setSuggestedActions([]);
    setValidationResults([]);
    setActionNotice("");
    setKnowledgeSources([]);
    setLoading(true);

    try {
      const calendarContextText =
        activePage === "calendar" && calendarContext ? buildCalendarContextText(calendarContext) : undefined;
      const requestContextText = aiContext
        ? buildAiContextText({ ...aiContext, intent: nextIntent, calendarContextText })
        : calendarContextText;

      // Best-effort: knowledge context is an enhancement, never blocks the
      // chat if the vault is unreadable or unset (see KNOWLEDGE_BASE_DESIGN.md).
      // Attached files are always included and consume the budget first;
      // automatic retrieval (Lite/Full) gets whatever budget remains.
      let attachedContextText: string | undefined;
      let attachedSources: RetrievedChunk[] = [];
      try {
        const attachedResult = await buildAttachedFilesContext(filesToAttach, knowledgeSettings.knowledgeBudgetChars);
        if (attachedResult) {
          attachedContextText = attachedResult.text;
          attachedSources = attachedResult.sources;
        }
      } catch {
        // Ignore — the chat proceeds without the attachment.
      }

      const remainingBudget = Math.max(0, knowledgeSettings.knowledgeBudgetChars - (attachedContextText?.length ?? 0));

      let autoContextText: string | undefined;
      let autoSources: RetrievedChunk[] = [];
      if (remainingBudget > 0) {
        try {
          const knowledgeSource = createKnowledgeContextSource(() => knowledgeSettings);
          if (await knowledgeSource.isReady()) {
            const knowledgeResult = await knowledgeSource.buildContext(content, remainingBudget);
            if (knowledgeResult) {
              autoContextText = knowledgeResult.text;
              autoSources = knowledgeResult.sources;
            }
          }
        } catch {
          // Ignore — the chat proceeds without knowledge context.
        }
      }

      const knowledgeContextText = [attachedContextText, autoContextText].filter(Boolean).join("\n\n") || undefined;
      const nextKnowledgeSources = [...attachedSources, ...autoSources];

      const response = await runPersonalAgent({
        messages: [...chatHistory, { role: "user", content }],
        contextText: requestContextText,
        knowledgeContext: knowledgeContextText,
        intent: nextIntent,
        model: aiModel || undefined,
      });
      setProvider(response.provider);
      setIntent(response.intent);
      setSuggestedActions(response.suggestedActions);
      setValidationResults(
        response.suggestedActions.length && aiContext
          ? validateAgentActions(response.suggestedActions, {
              tasks: aiContext.tasks,
              projects: aiContext.projects,
            })
          : [],
      );
      setMessages((current) => [...current, createMessage("assistant", response.content)]);
      setKnowledgeSources(nextKnowledgeSources);
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

          <div className="ollama-chat-modelbar">
            <label>
              <span>{t("ai.model.label")}</span>
              <select
                value={aiModel}
                onChange={(event) => onChangeAiModel?.(event.target.value)}
                disabled={!onChangeAiModel || modelsLoading}
              >
                <option value="">{t("ai.model.auto")}</option>
                {aiModel && !models.includes(aiModel) ? (
                  <option value={aiModel}>{aiModel}</option>
                ) : null}
                {models.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ollama-chat-model-refresh"
              aria-label={t("ai.model.refresh")}
              onClick={() => void loadModels()}
              disabled={modelsLoading}
            >
              {modelsLoading ? "…" : "↻"}
            </button>
          </div>

          {isOffline ? <div className="ollama-chat-status">{t("ai.status.offline")}</div> : null}

          <div className="ollama-chat-messages" role="log" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`ollama-chat-message ${message.role}`}>
                <span>{message.role === "user" ? t("ai.youLabel") : t("ai.aiLabel")}</span>
                <p>{message.content}</p>
              </div>
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
