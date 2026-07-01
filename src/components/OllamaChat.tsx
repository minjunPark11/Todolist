import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { askOllamaChat, type OllamaChatMessage } from "../lib/ollama";

type ChatMessage = OllamaChatMessage & {
  id: string;
};

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
  };
}

export function OllamaChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage("assistant", "Hi, I'm your local Ollama assistant. Ask me anything."),
  ]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatHistory = useMemo<OllamaChatMessage[]>(
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
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setLoading(true);

    try {
      const reply = await askOllamaChat([...chatHistory, { role: "user", content }]);
      setMessages((current) => [...current, createMessage("assistant", reply)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ollama chat failed.");
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
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className={open ? "ollama-chat open" : "ollama-chat"}>
      {open ? (
        <section className="ollama-chat-panel" aria-label="Ollama chat">
          <header className="ollama-chat-head">
            <div>
              <span>Local AI</span>
              <h2>Ollama Chat</h2>
            </div>
            <div className="ollama-chat-actions">
              <button type="button" onClick={clearChat}>Clear</button>
              <button type="button" aria-label="Close Ollama chat" onClick={() => setOpen(false)}>x</button>
            </div>
          </header>

          <div className="ollama-chat-messages" role="log" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`ollama-chat-message ${message.role}`}>
                <span>{message.role === "user" ? "You" : "Ollama"}</span>
                <p>{message.content}</p>
              </div>
            ))}
            {loading ? (
              <div className="ollama-chat-message assistant">
                <span>Ollama</span>
                <p>Thinking...</p>
              </div>
            ) : null}
          </div>

          {error ? <div className="ollama-chat-error">{error}</div> : null}

          <form className="ollama-chat-form" onSubmit={submit}>
            <textarea
              ref={inputRef}
              value={draft}
              rows={2}
              placeholder="Message Ollama..."
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
