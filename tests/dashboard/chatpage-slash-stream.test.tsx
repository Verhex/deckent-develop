// @vitest-environment happy-dom
/**
 * ChatPage slash + streaming tests (Sprint 221 / task 221-011).
 *
 * Verifies dashboard ChatPage achieves claude.ai/code-style conversation-centric UX:
 *   (1) streaming chunks render incrementally into the assistant bubble
 *   (2) `/status` slash forwards to /api/chat (backend agentic intent classifier)
 *   (3) `/clear` slash clears local history without hitting the backend
 *   (4) error path renders the localized failure message
 *
 * Terminal-parity reference: task 221-003 slash registry (/help /clear /status
 * /recall /plan). Bearer token attachment is exercised transitively via
 * useApi.post (see tests/dashboard/api-client-token.test.ts).
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import type { ChatStreamHandlers } from "../../src/dashboard/src/lib/chat-stream-client";

vi.mock("../../src/dashboard/src/hooks/useSSE", () => ({
  useSSE: vi.fn(() => null),
  useSSEWithStatus: vi.fn(() => ({ data: null, status: "connecting" })),
}));

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock("../../src/dashboard/src/lib/useApi", () => ({
  useApi: vi.fn(() => ({
    get: mockGet,
    post: mockPost,
  })),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  postJson: vi.fn().mockResolvedValue({ reply: "mocked" }),
  fetchJson: vi.fn().mockResolvedValue({}),
  buildSseUrl: vi.fn((url: string) => url),
  getBootstrapApiToken: vi.fn(() => undefined),
}));

// Stream mock — captures handlers so individual tests can drive chunks / errors.
let lastStreamHandlers: ChatStreamHandlers | null = null;
const streamClose = vi.fn();
const streamMock = vi.fn((opts: { message: string; handlers: ChatStreamHandlers }) => {
  lastStreamHandlers = opts.handlers;
  return { close: streamClose };
});

vi.mock("../../src/dashboard/src/lib/chat-stream-client", () => ({
  streamChatResponse: (opts: { message: string; handlers: ChatStreamHandlers }) =>
    streamMock(opts),
  buildChatStreamUrl: vi.fn(() => "/api/chat/stream"),
}));

import ChatPage from "../../src/dashboard/src/pages/ChatPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  lastStreamHandlers = null;
});

function renderPage() {
  return render(
    <LanguageProvider>
      <ChatPage />
    </LanguageProvider>,
  );
}

async function sendMessage(text: string) {
  const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
  const sendBtn = screen.getByTestId("chat-send") as HTMLButtonElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.click(sendBtn);
  });
}

describe("ChatPage slash + streaming (221-011)", () => {
  beforeEach(() => {
    // Default: POST hangs forever — tests drive the stream explicitly so that
    // the POST fallback never fires unless the test wants it to.
    mockPost.mockImplementation(() => new Promise(() => {}));
  });

  it("renders streaming chunks incrementally into the assistant bubble (akan cevap)", async () => {
    renderPage();

    await sendMessage("merhaba");

    // The stream was opened with the typed message
    await waitFor(() => {
      expect(streamMock).toHaveBeenCalledTimes(1);
    });
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "merhaba" }),
    );

    // Emit two incremental chunks then a done event
    await act(async () => {
      lastStreamHandlers?.onChunk("Sel");
    });
    expect(screen.getByText(/^Sel$/)).toBeTruthy();

    await act(async () => {
      lastStreamHandlers?.onChunk("am!");
    });
    expect(screen.getByText(/Selam!/)).toBeTruthy();

    await act(async () => {
      lastStreamHandlers?.onDone("Selam!");
    });

    // User bubble + final assistant content present, input re-enabled
    expect(screen.getByText("merhaba")).toBeTruthy();
    expect(screen.getByText("Selam!")).toBeTruthy();
    await waitFor(() => {
      const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
      expect(input.disabled).toBe(false);
    });
  });

  it("forwards /status slash to /api/chat for backend agentic dispatch", async () => {
    mockPost.mockResolvedValueOnce({ reply: "sprint-221 EXECUTING 8/17" });
    renderPage();

    await sendMessage("/status");

    // Slash messages still go through POST (and stream) — backend agentic
    // intent classifier (chat-backend.ts) handles them.
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/chat", { message: "/status" });
    });

    // User bubble carries the slash payload + slash flag rendered (data-slash)
    const userBubble = screen.getByText("/status").closest("[data-slash]");
    expect(userBubble).toBeTruthy();
    expect(userBubble?.getAttribute("data-slash")).toBe("true");

    // POST fallback renders the assistant reply (stream emits nothing here)
    await waitFor(() => {
      expect(screen.getByText("sprint-221 EXECUTING 8/17")).toBeTruthy();
    });
  });

  it("/clear slash clears history locally and does NOT hit the backend", async () => {
    mockPost.mockResolvedValue({ reply: "ok" });
    renderPage();

    // Send a regular turn so the history has content to clear
    await sendMessage("önce bir mesaj");
    await act(async () => {
      lastStreamHandlers?.onDone("ilk cevap");
    });

    await waitFor(() => {
      expect(screen.getByText("önce bir mesaj")).toBeTruthy();
      expect(screen.getByText("ilk cevap")).toBeTruthy();
    });

    const postCallsBefore = mockPost.mock.calls.length;
    const streamCallsBefore = streamMock.mock.calls.length;

    // /clear must be intercepted client-side
    await sendMessage("/clear");

    // Backend MUST NOT be touched by /clear
    expect(mockPost.mock.calls.length).toBe(postCallsBefore);
    expect(streamMock.mock.calls.length).toBe(streamCallsBefore);

    // History is now empty (empty placeholder renders)
    await waitFor(() => {
      expect(screen.getByTestId("chat-empty")).toBeTruthy();
    });
    expect(screen.queryByText("önce bir mesaj")).toBeNull();
    expect(screen.queryByText("ilk cevap")).toBeNull();
  });

  it("renders the localized error response when both stream and POST fail", async () => {
    mockPost.mockRejectedValueOnce(new Error("POST /api/chat failed: 500"));
    renderPage();

    await sendMessage("kırılacak mesaj");

    // Drive a stream error first — should be swallowed, POST fallback runs
    await act(async () => {
      lastStreamHandlers?.onError("stream connection error");
    });

    // POST fallback rejects → localized error appears
    await waitFor(() => {
      expect(screen.getByText(/Failed to get a response/i)).toBeTruthy();
    });

    // The app must not crash and chat history container is still mounted
    expect(screen.getByTestId("chat-history")).toBeTruthy();
    // Input is re-enabled so the user can retry
    const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
  });

  it("empty input is a no-op: send button stays disabled and no backend call is made", async () => {
    renderPage();

    const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    const sendBtn = screen.getByTestId("chat-send") as HTMLButtonElement;

    // Initially disabled because value is empty
    expect(sendBtn.disabled).toBe(true);

    // Whitespace-only also stays disabled (no submission)
    await act(async () => {
      fireEvent.change(input, { target: { value: "   " } });
    });
    expect(sendBtn.disabled).toBe(true);

    // Even forcing a click does not produce a backend call
    await act(async () => {
      fireEvent.click(sendBtn);
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();

    // The empty placeholder is rendered, not a chat history container
    expect(screen.getByTestId("chat-empty")).toBeTruthy();
    expect(screen.queryByTestId("chat-history")).toBeNull();
  });

  it("/help slash shows the slash registry locally without hitting backend", async () => {
    renderPage();

    await sendMessage("/help");

    // Backend MUST NOT be touched
    expect(mockPost).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();

    // The help payload lists the slash registry (terminal parity)
    await waitFor(() => {
      expect(screen.getByText(/\/status/)).toBeTruthy();
      expect(screen.getByText(/\/recall/)).toBeTruthy();
      expect(screen.getByText(/\/plan/)).toBeTruthy();
    });
  });

  it("typing '/' surfaces the slash-hint dropdown with all five commands", async () => {
    renderPage();

    const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "/" } });
    });

    const hint = await screen.findByTestId("slash-hint");
    expect(hint.textContent).toContain("/help");
    expect(hint.textContent).toContain("/clear");
    expect(hint.textContent).toContain("/status");
    expect(hint.textContent).toContain("/recall");
    expect(hint.textContent).toContain("/plan");
  });
});
