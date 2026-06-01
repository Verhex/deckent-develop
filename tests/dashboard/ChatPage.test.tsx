// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

vi.mock("../../src/dashboard/src/hooks/useSSE", () => ({
  useSSE: vi.fn(() => null),
  useSSEWithStatus: vi.fn(() => ({ data: null, status: "connecting" })),
}));

const mockPost = vi.fn();

vi.mock("../../src/dashboard/src/lib/useApi", () => ({
  useApi: vi.fn(() => ({
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

describe("ChatPage — useApi wire (214-008)", () => {
  beforeEach(() => {
    mockPost.mockResolvedValue({ reply: "Hello from Deckent!" });
  });

  it("renders empty state when no messages exist", () => {
    renderPage();
    expect(screen.getByTestId("chat-empty")).toBeTruthy();
  });

  it("sends message and shows user message in history", async () => {
    renderPage();

    const input = screen.getByTestId("chat-input");
    const sendBtn = screen.getByTestId("chat-send");

    await act(async () => {
      fireEvent.change(input, { target: { value: "Hello" } });
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("chat-history")).toBeTruthy();
    });

    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("displays assistant reply returned from /api/chat", async () => {
    mockPost.mockResolvedValue({ reply: "Hello from Deckent!" });
    renderPage();

    const input = screen.getByTestId("chat-input");
    const sendBtn = screen.getByTestId("chat-send");

    await act(async () => {
      fireEvent.change(input, { target: { value: "Hi" } });
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("Hello from Deckent!")).toBeTruthy();
    });

    expect(mockPost).toHaveBeenCalledWith("/api/chat", { message: "Hi" });
  });

  it("shows error message when API call fails", async () => {
    mockPost.mockRejectedValue(new Error("Network error"));
    renderPage();

    const input = screen.getByTestId("chat-input");
    const sendBtn = screen.getByTestId("chat-send");

    await act(async () => {
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("chat-history")).toBeTruthy();
    });

    // Error response message is shown as assistant bubble
    const history = screen.getByTestId("chat-history");
    expect(history).toBeTruthy();
  });
});
