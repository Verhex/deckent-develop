// @vitest-environment happy-dom
/**
 * ChatPage streaming + evolution-data wire tests (Sprint 220-008).
 *
 * Verifies the upgrade from Sprint 218-003 (POST round-trip only) to
 * Sprint 220-008 (POST round-trip + akan-cevap via streamChatResponse).
 *
 * Tests cover:
 *  1. boş — empty-state rendered before any messages.
 *  2. mesaj → cevap — typed message opens streamChatResponse, onDone reply
 *     renders into the assistant bubble.
 *  3. akan render — multiple onChunk calls extend the assistant bubble
 *     incrementally; onDone finalizes the content.
 *  4. error — onError + POST rejection renders localized error response.
 *  5. multi-turn — two sequential sends produce two stream sessions and
 *     four bubbles (two user + two assistant) in order.
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
  useApi: vi.fn(() => ({ get: mockGet, post: mockPost })),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  postJson: vi.fn().mockResolvedValue({ reply: "mocked" }),
  fetchJson: vi.fn().mockResolvedValue({}),
  buildSseUrl: vi.fn((url: string) => url),
  getBootstrapApiToken: vi.fn(() => undefined),
}));

interface StreamHandlers {
  onChunk: (text: string) => void;
  onDone: (reply: string) => void;
  onError: (message: string) => void;
}

let capturedHandlers: StreamHandlers | null = null;
let capturedMessage: string | null = null;
const streamCalls: { message: string; handlers: StreamHandlers }[] = [];
const mockClose = vi.fn();

vi.mock("../../src/dashboard/src/lib/chat-stream-client", () => ({
  streamChatResponse: vi.fn(
    (opts: { message: string; handlers: StreamHandlers }) => {
      capturedHandlers = opts.handlers;
      capturedMessage = opts.message;
      streamCalls.push(opts);
      return { close: mockClose };
    },
  ),
  buildChatStreamUrl: vi.fn(),
}));

import ChatPage from "../../src/dashboard/src/pages/ChatPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  capturedHandlers = null;
  capturedMessage = null;
  streamCalls.length = 0;
});

beforeEach(() => {
  // Default: POST never resolves so the stream wins. Individual tests
  // override this for the POST-fallback / error scenarios.
  mockPost.mockImplementation(() => new Promise<{ reply: string }>(() => {}));
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

describe("ChatPage streaming + evolution-data wire (220-008)", () => {
  it("renders the empty state before any messages are sent (boş)", () => {
    renderPage();
    expect(screen.getByTestId("chat-empty")).toBeTruthy();
  });

  it("opens streamChatResponse with the typed message and renders the reply on onDone (mesaj→cevap)", async () => {
    renderPage();
    await sendMessage("durum ne");

    // Stream opened with the user message — carries Bearer/token via
    // buildChatStreamUrl inside chat-stream-client.
    expect(capturedMessage).toBe("durum ne");
    expect(capturedHandlers).not.toBeNull();
    // User bubble rendered immediately.
    expect(screen.getByText("durum ne")).toBeTruthy();

    // onDone delivers the final reply.
    await act(async () => {
      capturedHandlers!.onDone("sprint durumu hazır");
    });
    await waitFor(() => {
      expect(screen.getByText("sprint durumu hazır")).toBeTruthy();
    });
  });

  it("renders streaming chunks incrementally (akan render)", async () => {
    renderPage();
    await sendMessage("merhaba");

    expect(capturedHandlers).not.toBeNull();

    // First chunk: bubble shows partial text.
    await act(async () => {
      capturedHandlers!.onChunk("Mer");
    });
    expect(screen.getByText("Mer")).toBeTruthy();

    // Second chunk: bubble extends.
    await act(async () => {
      capturedHandlers!.onChunk("haba!");
    });
    expect(screen.getByText("Merhaba!")).toBeTruthy();

    // onDone finalizes content (server's authoritative reply).
    await act(async () => {
      capturedHandlers!.onDone("Merhaba! Yardımcı olabilirim.");
    });
    expect(screen.getByText("Merhaba! Yardımcı olabilirim.")).toBeTruthy();
  });

  it("renders the localized error response when stream errors AND POST rejects (error)", async () => {
    mockPost.mockRejectedValue(new Error("POST /api/chat failed: 500"));
    renderPage();
    await sendMessage("ping");

    // Stream connection error.
    expect(capturedHandlers).not.toBeNull();
    await act(async () => {
      capturedHandlers!.onError("connection lost");
    });

    // Error response renders via POST-fallback path.
    await waitFor(() => {
      expect(screen.getByText(/Failed to get a response/i)).toBeTruthy();
    });
    // App still mounted.
    expect(screen.getByTestId("chat-history")).toBeTruthy();
  });

  it("supports multi-turn streaming: two sends produce two stream sessions and four bubbles (multi-turn)", async () => {
    renderPage();

    await sendMessage("first question");
    expect(capturedMessage).toBe("first question");
    await act(async () => {
      capturedHandlers!.onDone("first reply");
    });
    await waitFor(() => {
      expect(screen.getByText("first reply")).toBeTruthy();
    });

    await sendMessage("second question");
    expect(capturedMessage).toBe("second question");
    await act(async () => {
      capturedHandlers!.onDone("second reply");
    });
    await waitFor(() => {
      expect(screen.getByText("second reply")).toBeTruthy();
    });

    // Two stream sessions opened — one per send.
    expect(streamCalls.length).toBe(2);
    expect(streamCalls[0].message).toBe("first question");
    expect(streamCalls[1].message).toBe("second question");

    // All four bubbles still visible.
    expect(screen.getByText("first question")).toBeTruthy();
    expect(screen.getByText("second question")).toBeTruthy();
    expect(screen.getByText("first reply")).toBeTruthy();
    expect(screen.getByText("second reply")).toBeTruthy();
  });
});
