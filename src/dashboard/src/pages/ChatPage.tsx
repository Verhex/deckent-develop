/**
 * ChatPage — 7th dashboard page.
 * User can chat with Deckent, see nervous system notifications live,
 * and monitor running task context.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useSSE } from "../hooks/useSSE";
import { postJson } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useTranslation } from "../i18n/LanguageProvider";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { ScrollArea } from "../components/ui/scroll-area";
import { Send, Bot, User, Bell, Activity } from "lucide-react";
import type { DashboardState } from "../types";

// ── Types ────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
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

  return (
    <div className="flex gap-2 items-end border-t border-zinc-800 bg-zinc-900 p-4">
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
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="chat-send"
        aria-label={t("chat.send")}
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── ChatHistory ──────────────────────────────────

function ChatHistory({ messages }: { messages: ChatMessage[] }) {
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-900 text-blue-300">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
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
  const { post } = useApi();
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
    const userMsg: ChatMessage = {
      id: `msg-${++msgIdCounter}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const response = await post<{ reply: string }>("/api/chat", { message: content });
      const assistantMsg: ChatMessage = {
        id: `msg-${++msgIdCounter}`,
        role: "assistant",
        content: response.reply,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg-${++msgIdCounter}`,
        role: "assistant",
        content: t("chat.error_response"),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  }, [t, post]);

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] -m-6">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3 bg-zinc-900/50">
          <Bot className="h-5 w-5 text-blue-400" />
          <h1 className="text-sm font-bold text-zinc-100">{t("chat.title")}</h1>
        </div>

        {/* Notification panel */}
        <NotificationPanel notifications={notifications} />

        {/* Chat history */}
        <ChatHistory messages={messages} />

        {/* Chat input */}
        <ChatInput onSend={handleSend} disabled={sending} />
      </div>

      {/* Task context sidebar */}
      <TaskContextSidebar state={sseState} />
    </div>
  );
}
