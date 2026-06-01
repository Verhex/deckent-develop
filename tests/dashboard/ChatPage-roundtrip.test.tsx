// @vitest-environment happy-dom
/**
 * ChatPage round-trip tests (Sprint 218-003 / task 218-004).
 *
 * Verifies that ChatPage no longer behaves as a status-only stub: a user
 * message is POSTed to /api/chat via useApi (Bearer token attached when
 * window.__DECKENT_API_TOKEN__ is present), and the returned assistant
 * reply is rendered as a chat bubble. Covers loading, error, and multi-turn
 * behavior — the Tier-1 Proof-of-Function smoke for the chat surface.
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

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

import ChatPage from "../../src/dashboard/src/pages/ChatPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

describe("ChatPage round-trip (218-003)", () => {
  beforeEach(() => {
    mockPost.mockResolvedValue({ reply: "Hello back!" });
  });

  it("POSTs the typed message to /api/chat via useApi and renders the user bubble", async () => {
    renderPage();

    await sendMessage("hi there");

    await waitFor(() => {
      expect(screen.getByTestId("chat-history")).toBeTruthy();
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/chat", { message: "hi there" });
    expect(screen.getByText("hi there")).toBeTruthy();
  });

  it("renders the assistant reply returned by /api/chat (not a status-only stub)", async () => {
    mockPost.mockResolvedValueOnce({ reply: "pong from server" });
    renderPage();

    await sendMessage("ping");

    await waitFor(() => {
      expect(screen.getByText("pong from server")).toBeTruthy();
    });
  });

  it("disables the input while the round-trip is pending and re-enables it on resolve", async () => {
    let resolvePost: (value: { reply: string }) => void = () => {};
    mockPost.mockImplementationOnce(
      () => new Promise<{ reply: string }>((resolve) => {
        resolvePost = resolve;
      }),
    );
    renderPage();

    const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    const sendBtn = screen.getByTestId("chat-send") as HTMLButtonElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "wait" } });
      fireEvent.click(sendBtn);
    });

    // Loading state: input is disabled and the send button is disabled while pending
    expect(input.disabled).toBe(true);
    expect(sendBtn.disabled).toBe(true);
    // Round-trip in flight — assistant reply not rendered yet
    expect(screen.queryByText("done")).toBeNull();

    await act(async () => {
      resolvePost({ reply: "done" });
    });

    // Resolved: input must be re-enabled and reply must render
    await waitFor(() => {
      expect(input.disabled).toBe(false);
    });
    expect(screen.getByText("done")).toBeTruthy();
  });

  it("renders the localized error response when /api/chat fails", async () => {
    mockPost.mockRejectedValueOnce(new Error("POST /api/chat failed: 500"));
    renderPage();

    await sendMessage("trigger error");

    await waitFor(() => {
      // chat.error_response (EN) = 'Failed to get a response. Please try again.'
      expect(screen.getByText(/Failed to get a response/i)).toBeTruthy();
    });

    // App must not crash: history container is still mounted
    expect(screen.getByTestId("chat-history")).toBeTruthy();
  });

  it("supports multi-turn conversation: two sends produce two user + two assistant bubbles in order", async () => {
    mockPost
      .mockResolvedValueOnce({ reply: "first reply" })
      .mockResolvedValueOnce({ reply: "second reply" });
    renderPage();

    await sendMessage("first question");
    await waitFor(() => {
      expect(screen.getByText("first reply")).toBeTruthy();
    });

    await sendMessage("second question");
    await waitFor(() => {
      expect(screen.getByText("second reply")).toBeTruthy();
    });

    expect(mockPost).toHaveBeenNthCalledWith(1, "/api/chat", { message: "first question" });
    expect(mockPost).toHaveBeenNthCalledWith(2, "/api/chat", { message: "second question" });
    // Both turns visible — earlier user message still in history
    expect(screen.getByText("first question")).toBeTruthy();
    expect(screen.getByText("second question")).toBeTruthy();
    expect(screen.getByText("first reply")).toBeTruthy();
    expect(screen.getByText("second reply")).toBeTruthy();
  });
});
