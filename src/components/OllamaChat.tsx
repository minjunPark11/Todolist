import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
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

function getProviderLabel(provider?: AiProviderName) {
  if (provider === "server") return "Server AI";
  if (provider === "remote-ollama") return "Remote Ollama";
  if (provider === "ollama") return "Local Ollama";
  return "Local-first AI";
}

export function OllamaChat({ activePage, calendarContext, aiContext, onExecuteActions }: OllamaChatProps = {}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage("assistant", "Hi, I'm your personal local-first AI assistant. Ask me anything."),
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
      setError(err instanceof Error ? err.message : "AI chat failed.");
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
    setMessages([createMessage("assistant", "Chat cleared. What should we think through next?")]);
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
    setActionNotice("Suggestion dismissed. No app data changed.");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function requestApplyActions() {
    const hasInvalidAction = validationResults.some((result) => result.status === "invalid");
    if (!onExecuteActions) {
      setActionNotice("Action executor is not connected yet. No app data changed.");
      return;
    }
    if (hasInvalidAction) {
      setActionNotice("Some suggested actions are invalid. No app data changed.");
      return;
    }

    const results = onExecuteActions(suggestedActions);
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      setActionNotice(`Some actions failed: ${failed.map((result) => result.message).join(" ")}`);
      return;
    }

    setSuggestedActions([]);
    setValidationResults([]);
    setActionNotice(`${results.length} action${results.length === 1 ? "" : "s"} applied.`);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className={open ? "ollama-chat open" : "ollama-chat"}>
      {open ? (
        <section className="ollama-chat-panel" aria-label="Ollama chat">
          <header className="ollama-chat-head">
            <div>
              <span>{getProviderLabel(provider)}</span>
              <h2>Personal AI</h2>
              <small>{getIntentLabel(intent)}</small>
            </div>
            <div className="ollama-chat-actions">
              <button type="button" onClick={clearChat}>Clear</button>
              <button type="button" aria-label="Close Ollama chat" onClick={() => setOpen(false)}>x</button>
            </div>
          </header>

          <div className="ollama-chat-messages" role="log" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`ollama-chat-message ${message.role}`}>
                <span>{message.role === "user" ? "You" : "AI"}</span>
                <p>{message.content}</p>
              </div>
            ))}
            {loading ? (
              <div className="ollama-chat-message assistant">
                <span>AI</span>
                <p>Thinking...</p>
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
              placeholder="Message Personal AI..."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button type="submit" disabled={!draft.trim() || loading}>Send</button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="ollama-chat-fab"
        aria-label={open ? "Close Ollama chat" : "Open Ollama chat"}
        aria-expanded={open}
        onClick={toggleOpen}
      >
        {open ? "x" : "AI"}
      </button>
    </div>
  );
}
