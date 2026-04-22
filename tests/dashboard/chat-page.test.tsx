import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_DIR = join(process.cwd(), "src", "dashboard");
const CHAT_PAGE_PATH = join(DASHBOARD_DIR, "src/pages/ChatPage.tsx");
const APP_PATH = join(DASHBOARD_DIR, "src/App.tsx");
const LAYOUT_PATH = join(DASHBOARD_DIR, "src/components/Layout.tsx");
const EN_PATH = join(DASHBOARD_DIR, "src/i18n/en.ts");
const TR_PATH = join(DASHBOARD_DIR, "src/i18n/tr.ts");
const ROUTES_PATH = join(DASHBOARD_DIR, "src/routes.tsx");

describe("dashboard/pages — ChatPage", () => {
  it("ChatPage.tsx file exists", () => {
    expect(existsSync(CHAT_PAGE_PATH)).toBe(true);
  });

  it("routes.tsx file exists with /chat route", () => {
    expect(existsSync(ROUTES_PATH)).toBe(true);
    const content = readFileSync(ROUTES_PATH, "utf-8");
    expect(content).toContain("/chat");
  });

  it("contains ChatInput component with textarea and send button", () => {
    const content = readFileSync(CHAT_PAGE_PATH, "utf-8");
    expect(content).toContain("ChatInput");
    expect(content).toContain("Textarea");
    expect(content).toContain('data-testid="chat-input"');
    expect(content).toContain('data-testid="chat-send"');
    expect(content).toContain("Send");
  });

  it("contains ChatHistory component with user/assistant message rendering", () => {
    const content = readFileSync(CHAT_PAGE_PATH, "utf-8");
    expect(content).toContain("ChatHistory");
    expect(content).toContain('data-testid="chat-history"');
    expect(content).toContain('"user"');
    expect(content).toContain('"assistant"');
    expect(content).toContain("Bot");
    expect(content).toContain("User");
  });

  it("contains NotificationPanel with SSE event stream integration", () => {
    const content = readFileSync(CHAT_PAGE_PATH, "utf-8");
    expect(content).toContain("NotificationPanel");
    expect(content).toContain('data-testid="notification-panel"');
    expect(content).toContain("DECKENT→USER:NOTIFY");
    expect(content).toContain("nervous");
    expect(content).toContain("severity");
  });

  it("contains TaskContextSidebar with sprint status display", () => {
    const content = readFileSync(CHAT_PAGE_PATH, "utf-8");
    expect(content).toContain("TaskContextSidebar");
    expect(content).toContain('data-testid="task-sidebar"');
    expect(content).toContain("sprint.id");
    expect(content).toContain("sprint.phase");
    expect(content).toContain("progress.done");
    expect(content).toContain("progress.total");
  });

  it("uses useSSE hook for real-time data", () => {
    const content = readFileSync(CHAT_PAGE_PATH, "utf-8");
    expect(content).toContain('useSSE("/api/events")');
    expect(content).toContain('from "../hooks/useSSE"');
  });

  it("uses postJson for sending chat messages", () => {
    const content = readFileSync(CHAT_PAGE_PATH, "utf-8");
    expect(content).toContain("postJson");
    expect(content).toContain('"/api/chat"');
  });

  it("App.tsx registers /chat route", () => {
    const content = readFileSync(APP_PATH, "utf-8");
    expect(content).toContain('path="/chat"');
    expect(content).toContain("ChatPage");
    expect(content).toContain('./pages/ChatPage');
  });

  it("Layout.tsx includes chat navigation item", () => {
    const content = readFileSync(LAYOUT_PATH, "utf-8");
    expect(content).toContain('"/chat"');
    expect(content).toContain('"nav.chat"');
    expect(content).toContain("MessageCircle");
  });

  it("i18n en.ts has all chat translation keys", () => {
    const content = readFileSync(EN_PATH, "utf-8");
    const requiredKeys = [
      "nav.chat",
      "chat.title",
      "chat.input_placeholder",
      "chat.send",
      "chat.empty",
      "chat.error_response",
      "chat.notifications",
      "chat.no_notifications",
      "chat.task_context",
      "chat.no_active_sprint",
      "chat.sprint",
      "chat.phase",
      "chat.progress",
      "chat.active_tasks",
    ];
    for (const key of requiredKeys) {
      expect(content).toContain(`'${key}'`);
    }
  });

  it("i18n tr.ts has all chat translation keys", () => {
    const content = readFileSync(TR_PATH, "utf-8");
    const requiredKeys = [
      "nav.chat",
      "chat.title",
      "chat.input_placeholder",
      "chat.send",
      "chat.empty",
      "chat.error_response",
      "chat.notifications",
      "chat.no_notifications",
      "chat.task_context",
      "chat.no_active_sprint",
      "chat.sprint",
      "chat.phase",
      "chat.progress",
      "chat.active_tasks",
    ];
    for (const key of requiredKeys) {
      expect(content).toContain(`'${key}'`);
    }
  });

  it("handles Enter key to send and Shift+Enter for newline", () => {
    const content = readFileSync(CHAT_PAGE_PATH, "utf-8");
    expect(content).toContain("Enter");
    expect(content).toContain("shiftKey");
    expect(content).toContain("preventDefault");
  });

  it("displays message timestamps", () => {
    const content = readFileSync(CHAT_PAGE_PATH, "utf-8");
    expect(content).toContain("toLocaleTimeString");
    expect(content).toContain("timestamp");
  });
});
