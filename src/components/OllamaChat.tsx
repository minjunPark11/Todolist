import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AgentActionPreview } from "./ai/AgentActionPreview";
import type { AgentAction } from "../lib/ai/agent/actions";
import { runPersonalAgent } from "../lib/ai/agent/personalAgent";
import { detectAgentIntent, getIntentLabel, type AgentIntent } from "../lib/ai/agent/intent";
import { buildAiContextText, type AiContextInput } from "../lib/ai/context/buildAiContext";
import {
  validateAgentActions,
  type ToolExecutionResult,
  type ToolValidationResult,
} from "../lib/ai/tools/toolExecutor";
import type { AiMessage, AiProviderName } from "../lib/ai/types";
import { buildCalendarContextText, type CalendarContextInput } from "../lib/calendarContext";
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
}

function getProviderLabel(t: (key: string) => string, provider?: AiProviderName) {
  if (provider === "server") return t("ai.provider.server");
  if (provider === "remote-ollama") return t("ai.provider.remoteOllama");
  if (provider === "ollama") return t("ai.provider.localOllama");
  return t("ai.provider.localFirst");
}

export function OllamaChat({ activePage, calendarContext, aiContext, onExecuteActions }: OllamaChatProps = {}) {
  const { t } = useT();
  const motionEnabled = useMotionEnabled();
  const [open, setOpen] = useState(false);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || loading) {
      return;
    }

    const userMessage = createMessage("user", content);
    const nextIntent = detectAgentIntent(content);
    setIntent(nextIntent);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setSuggestedActions([]);
    setValidationResults([]);
    setActionNotice("");
    setLoading(true);

    try {
      const calendarContextText =
        activePage === "calendar" && calendarContext ? buildCalendarContextText(calendarContext) : undefined;
      const requestContextText = aiContext
        ? buildAiContextText({ ...aiContext, intent: nextIntent, calendarContextText })
        : calendarContextText;
      const response = await runPersonalAgent({
        messages: [...chatHistory, { role: "user", content }],
        contextText: requestContextText,
        intent: nextIntent,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ai.error.chatFailed"));
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
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
              <h2>{t("ai.personalAiTitle")}</h2>
              <small>{getIntentLabel(intent)}</small>
            </div>
            <div className="ollama-chat-actions">
              <button type="button" onClick={clearChat}>{t("ai.clear")}</button>
              <button type="button" aria-label={t("ai.closeChat")} onClick={() => setOpen(false)}>x</button>
            </div>
          </header>

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
          {actionNotice ? <div className="ollama-chat-notice">{actionNotice}</div> : null}
          <AgentActionPreview
            actions={suggestedActions}
            validationResults={validationResults}
            canApply={Boolean(onExecuteActions)}
            onDismiss={dismissActions}
            onRequestApply={requestApplyActions}
          />

          <form className="ollama-chat-form" onSubmit={submit}>
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
