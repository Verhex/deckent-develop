/**
 * ChatPage — 7th dashboard page.
 * User can chat with Deckent, see nervous system notifications live,
 * and monitor running task context.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useSSE } from "../hooks/useSSE";
import { postJson } from "../lib/api";
import { useApiClient } from "../lib/useApiClient";
import { streamChatResponse } from "../lib/chat-stream-client";
import { useTranslation } from "../i18n/LanguageProvider";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { ScrollArea } from "../components/ui/scroll-area";
import { Send, Bot, User, Bell, Activity, AlertCircle, RefreshCw } from "lucide-react";
import type { DashboardState } from "../types";

// ── Types ────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isSlash?: boolean;
  isError?: boolean;
  retryMessage?: string;
}

// ── Slash registry (terminal-parity with task 221-003) ──────────
// Same set surfaced by the native REPL slash registry. Backend agentic intent
// classifier handles /status, /recall, /plan; /clear and /help are local UX.
// Authorization: Bearer <token> is attached server-side by useApiClient.post — see
// src/dashboard/src/lib/useApiClient.ts.
const SLASH_COMMANDS: ReadonlyArray<{ name: string; desc: string; local: boolean }> = [
  { name: "/help", desc: "Slash komut listesi", local: true },
  { name: "/clear", desc: "Konuşmayı temizle", local: true },
  { name: "/status", desc: "Sprint durumu", local: false },
  { name: "/recall", desc: "Hafıza ara", local: false },
  { name: "/plan", desc: "Sprint planı", local: false },
];

function isSlash(line: string): boolean {
  return line.startsWith("/");
}

function buildHelpText(): string {
  return SLASH_COMMANDS.map((c) => `${c.name} — ${c.desc}`).join("\n");
}

interface NotifyEvent {
  id: string;
  name: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
}

// ── ChatInput ────────────────────────────────────

function ChatInput({ onSend, disabled }: { onSend: (msg: string) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    textareaRef.current?.focus();
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const slashHints = isSlash(value)
    ? SLASH_COMMANDS.filter((c) => c.name.startsWith(value.split(/\s/)[0]))
    : [];

  return (
    <div className="flex flex-col border-t border-zinc-800 bg-zinc-900">
      {slashHints.length > 0 && (
        <div
          className="border-b border-zinc-800 px-4 py-2 text-xs"
          data-testid="slash-hint"
        >
          {slashHints.map((c) => (
            <div key={c.name} className="flex gap-2 py-0.5">
              <span className="font-mono text-brand-300">{c.name}</span>
              <span className="text-zinc-500">{c.desc}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end p-4">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("chat.input_placeholder")}
          className="min-h-[44px] max-h-[120px] resize-none"
          disabled={disabled}
          data-testid="chat-input"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white transition-colors hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="chat-send"
          aria-label={t("chat.send")}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── ChatHistory ──────────────────────────────────

function ChatHistory({
  messages,
  onRetry,
  sending,
}: {
  messages: ChatMessage[];
  onRetry: (msg: string) => void;
  sending: boolean;
}) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm" data-testid="chat-empty">
        {t("chat.empty")}
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 p-4" data-testid="chat-history">
      <div className="space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-bg text-brand-300">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === "user"
                  ? msg.isSlash
                    ? "bg-brand-bg text-brand-fg font-mono"
                    : "bg-brand-600 text-white"
                  : msg.isError
                    ? "bg-red-950/40 border border-red-800/50 text-red-300"
                    : "bg-zinc-800 text-zinc-100"
              }`}
              data-slash={msg.isSlash ? "true" : undefined}
              data-testid={msg.isError ? "chat-error-bubble" : undefined}
            >
              {msg.isError ? (
                <div>
                  <div className="flex items-start gap-1.5">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.retryMessage && (
                    <button
                      onClick={() => onRetry(msg.retryMessage!)}
                      disabled={sending}
                      className="mt-2 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="chat-retry"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>{t("common.retry")}</span>
                    </button>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              <span className="mt-1 block text-[10px] opacity-60">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {msg.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-zinc-300">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

// ── NotificationPanel ────────────────────────────

function NotificationPanel({ notifications }: { notifications: NotifyEvent[] }) {
  const { t } = useTranslation();

  const severityVariant = (s: NotifyEvent["severity"]) => {
    if (s === "critical") return "critical" as const;
    if (s === "warning") return "warning" as const;
    return "info" as const;
  };

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/50" data-testid="notification-panel">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <Bell className="h-4 w-4 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-300">{t("chat.notifications")}</span>
        {notifications.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">{notifications.length}</Badge>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-500">{t("chat.no_notifications")}</p>
      ) : (
        <div className="max-h-[200px] overflow-y-auto">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-start gap-2 px-4 py-2 border-b border-zinc-800/50 last:border-0">
              <Badge variant={severityVariant(n.severity)} className="text-[10px] mt-0.5 shrink-0">
                {n.severity}
              </Badge>
              <div className="min-w-0">
                <p className="text-xs text-zinc-300 font-medium truncate">{n.name}</p>
                <p className="text-xs text-zinc-500 truncate">{n.message}</p>
              </div>
              <span className="ml-auto text-[10px] text-zinc-600 shrink-0">
                {new Date(n.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TaskContextSidebar ───────────────────────────

function TaskContextSidebar({ state }: { state: DashboardState | null }) {
  const { t } = useTranslation();

  const activeAgents = state?.agents.filter((a) => a.status === "EXECUTING") ?? [];

  return (
    <div className="w-full md:w-[280px] shrink-0 border-l border-zinc-800 bg-zinc-900/30" data-testid="task-sidebar">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Activity className="h-4 w-4 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-300">{t("chat.task_context")}</span>
      </div>

      {!state?.sprint ? (
        <p className="px-4 py-3 text-xs text-zinc-500">{t("chat.no_active_sprint")}</p>
      ) : (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{t("chat.sprint")}</span>
            <span className="text-xs font-mono text-zinc-300">{state.sprint.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{t("chat.phase")}</span>
            <Badge variant="info" className="text-[10px]">{state.sprint.phase}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{t("chat.progress")}</span>
            <span className="text-xs text-zinc-300">
              {state.progress.done}/{state.progress.total}
            </span>
          </div>

          {activeAgents.length > 0 && (
            <div className="mt-2 space-y-2">
              <span className="text-xs font-medium text-zinc-400">{t("chat.active_tasks")}</span>
              {activeAgents.map((agent) => (
                <div key={agent.id} className="rounded-md bg-zinc-800/50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-zinc-300">{agent.taskId ?? agent.id}</span>
                    <Badge variant="success" className="text-[10px]">{agent.status}</Badge>
                  </div>
                  {agent.currentAction && (
                    <p className="mt-1 text-[10px] text-zinc-500 truncate">{agent.currentAction}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ChatPage ─────────────────────────────────────

let msgIdCounter = 0;

export default function ChatPage() {
  const { t } = useTranslation();
  const sseState = useSSE("/api/events");
  const { post } = useApiClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<NotifyEvent[]>([]);
  const [sending, setSending] = useState(false);

  // Extract notifications from SSE alerts
  useEffect(() => {
    if (!sseState?.alerts) return;
    const notifyEvents: NotifyEvent[] = sseState.alerts
      .filter((a) => a.source === "DECKENT→USER:NOTIFY" || a.source === "nervous")
      .slice(-10)
      .map((a, i) => ({
        id: `notify-${i}-${a.timestamp}`,
        name: a.source ?? "notification",
        severity: a.level === "CRITICAL" ? "critical" as const : a.level === "WARNING" ? "warning" as const : "info" as const,
        message: a.message,
        timestamp: a.timestamp,
      }));
    setNotifications(notifyEvents);
  }, [sseState?.alerts]);

  const handleSend = useCallback(async (content: string) => {
    // Slash-command interception (terminal-parity, task 221-003).
    // Local slashes (/clear, /help) never hit the backend; agentic slashes
    // (/status, /recall, /plan) fall through to the standard POST+stream.
    if (isSlash(content)) {
      const cmd = content.split(/\s/)[0];
      if (cmd === "/clear") {
        setMessages([]);
        return;
      }
      if (cmd === "/help") {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${++msgIdCounter}`,
            role: "user",
            content,
            timestamp: new Date().toISOString(),
            isSlash: true,
          },
          {
            id: `msg-${++msgIdCounter}`,
            role: "assistant",
            content: buildHelpText(),
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: `msg-${++msgIdCounter}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      isSlash: isSlash(content),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    // Assistant placeholder — content is filled incrementally by stream chunks
    // (akan cevap) or by the /api/chat POST round-trip fallback.
    const assistantId = `msg-${++msgIdCounter}`;
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    }]);

    let streamedContent = "";
    let streamFinished = false;
    let streamStarted = false;
    let ctrl: { close: () => void } | null = null;

    // Open SSE stream for incremental token rendering (219-008 wire).
    try {
      ctrl = streamChatResponse({
        message: content,
        handlers: {
          onChunk: (text) => {
            streamStarted = true;
            streamedContent += text;
            setMessages((prev) => prev.map((m) =>
              m.id === assistantId ? { ...m, content: streamedContent } : m
            ));
          },
          onDone: (reply) => {
            streamFinished = true;
            setMessages((prev) => prev.map((m) =>
              m.id === assistantId ? { ...m, content: reply } : m
            ));
            setSending(false);
          },
          onError: () => {
            // Show visible error when stream fails before delivering content.
            // POST fallback (below) may still overwrite this with a real response.
            if (!streamStarted) {
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: t("chat.error_response"), isError: true, retryMessage: content }
                  : m
              ));
            }
          },
        },
      });
    } catch {
      // EventSource unavailable — POST fallback below handles the response.
    }

    // POST round-trip (Bearer via useApi) — fallback when stream emits nothing.
    // Guard: !streamStarted prevents overwriting stream chunks (race fix, DASH-UX-1).
    try {
      const response = await post<{ reply: string }>("/api/chat", { message: content });
      if (!streamStarted && !streamFinished) {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: response.reply, isError: false, retryMessage: undefined }
            : m
        ));
        ctrl?.close();
        setSending(false);
      }
    } catch {
      if (!streamStarted && !streamFinished) {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: t("chat.error_response"), isError: true, retryMessage: content }
            : m
        ));
        ctrl?.close();
        setSending(false);
      }
    }
  }, [t, post]);

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] -m-6">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3 bg-zinc-900/50">
          <Bot className="h-5 w-5 text-brand-300" />
          <h1 className="text-sm font-bold text-zinc-100">{t("chat.title")}</h1>
        </div>

        {/* Notification panel */}
        <NotificationPanel notifications={notifications} />

        {/* Chat history */}
        <ChatHistory messages={messages} onRetry={handleSend} sending={sending} />

        {/* Chat input */}
        <ChatInput onSend={handleSend} disabled={sending} />
      </div>

      {/* Task context sidebar */}
      <TaskContextSidebar state={sseState} />
    </div>
  );
}
