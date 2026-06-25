// @vitest-environment happy-dom
/**
 * chat-stream-honesty — 282-003 stream error visibility + race prevention.
 *
 * Tests:
 *  1. hata-görünür: onError shows visible error bubble (AlertCircle + i18n text + retry button)
 *  2. yarış-yok: stream chunks prevent POST from overwriting content
 *  3. retry: clicking retry re-sends the original user message
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

vi.mock("../../src/dashboard/src/lib/useApiClient", () => ({
  useApiClient: vi.fn(() => ({
    get: vi.fn(),
    post: mockPost,
  })),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  postJson: vi.fn().mockResolvedValue({ reply: "mocked" }),
  fetchJson: vi.fn().mockResolvedValue({}),
  buildSseUrl: vi.fn((url: string) => url),
  getBootstrapApiToken: vi.fn(() => undefined),
}));

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

describe("chat-stream-honesty (282-003)", () => {
  describe("hata-görünür — stream error is visible to user", () => {
    beforeEach(() => {
      // POST fails immediately so error state remains visible after setSending(false)
      mockPost.mockRejectedValue(new Error("POST failed"));
    });

    it("shows error bubble with icon and i18n text when stream onError fires", async () => {
      renderPage();

      await sendMessage("test message");

      // Drive a stream error before any chunk arrives
      await act(async () => {
        lastStreamHandlers?.onError("stream connection refused");
      });

      // POST also fails → setSending(false) called
      await waitFor(() => {
        const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
        expect(input.disabled).toBe(false);
      });

      // Error bubble must be visible (data-testid="chat-error-bubble")
      const errorBubble = screen.getByTestId("chat-error-bubble");
      expect(errorBubble).toBeTruthy();

      // i18n error text is rendered inside the bubble
      expect(errorBubble.textContent).toContain("Failed to get a response");
    });

    it("shows retry button inside the error bubble", async () => {
      renderPage();

      await sendMessage("retry test");

      await act(async () => {
        lastStreamHandlers?.onError("connection refused");
      });

      await waitFor(() => {
        const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
        expect(input.disabled).toBe(false);
      });

      // Retry button must be present and enabled (sending=false after POST fails)
      const retryBtn = screen.getByTestId("chat-retry");
      expect(retryBtn).toBeTruthy();
      expect((retryBtn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe("yarış-yok — stream chunks prevent POST from overwriting", () => {
    it("POST result does not overwrite stream content once a chunk has been received", async () => {
      // POST resolves slowly — we control when
      let resolvePost!: (v: { reply: string }) => void;
      mockPost.mockImplementation(
        () => new Promise<{ reply: string }>((r) => { resolvePost = r; }),
      );

      renderPage();
      await sendMessage("race test");

      // Stream delivers a chunk first (streamStarted = true)
      await act(async () => {
        lastStreamHandlers?.onChunk("Stream content");
      });

      expect(screen.getByText("Stream content")).toBeTruthy();

      // Now POST resolves with different content — must NOT overwrite the chunk
      await act(async () => {
        resolvePost({ reply: "POST would overwrite" });
      });

      // Stream content still visible; POST content must NOT appear
      expect(screen.queryByText("POST would overwrite")).toBeNull();
      expect(screen.getByText("Stream content")).toBeTruthy();

      // Finish stream cleanly
      await act(async () => {
        lastStreamHandlers?.onDone("Stream content — done");
      });

      // Input re-enabled after stream completes
      await waitFor(() => {
        const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
        expect(input.disabled).toBe(false);
      });
    });
  });

  describe("retry — clicking retry re-sends the original message", () => {
    it("clicking the retry button re-sends the original user message via handleSend", async () => {
      // First round: both stream and POST fail
      mockPost.mockRejectedValueOnce(new Error("POST failed"));
      // Second round (after retry): POST hangs so we can just verify the call
      mockPost.mockImplementation(() => new Promise(() => {}));

      renderPage();

      await sendMessage("original question");

      // Stream errors, POST also fails → error + retry button visible
      await act(async () => {
        lastStreamHandlers?.onError("refused");
      });

      await waitFor(() => {
        const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
        expect(input.disabled).toBe(false);
      });

      const retryBtn = screen.getByTestId("chat-retry");
      expect(retryBtn).toBeTruthy();

      // Click retry
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      // POST should have been called twice: once for original, once for retry
      await waitFor(() => {
        const calls = mockPost.mock.calls as Array<[string, { message: string }]>;
        expect(calls.length).toBeGreaterThanOrEqual(2);
        // Both calls must be for the original message
        expect(calls[0][1]).toEqual({ message: "original question" });
        expect(calls[1][1]).toEqual({ message: "original question" });
      });
    });
  });
});
