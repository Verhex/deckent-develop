// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

const postJsonMock = vi.fn();
const fetchJsonMock = vi.fn().mockResolvedValue({});

vi.mock("../../src/dashboard/src/lib/api", () => ({
  postJson: (...args: unknown[]) => postJsonMock(...args),
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
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

// SURF-7 (ADR-G-033): read-only cutover pin
describe("ChatPage — read-only signpost (SURF-7)", () => {
  it("renders the chat-page signpost with the readonly notice", () => {
    renderPage();
    expect(screen.getByTestId("chat-page")).toBeTruthy();
    expect(screen.getByTestId("readonly-notice")).toBeTruthy();
  });

  it("has NO textarea, NO input, and NO send button", () => {
    const { container } = renderPage();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.queryByTestId("chat-input")).toBeNull();
    expect(screen.queryByTestId("chat-send")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("performs no fetch/postJson to /api/chat or /api/chat/stream on mount", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      renderPage();
      expect(postJsonMock).not.toHaveBeenCalled();
      const chatCalls = [...fetchJsonMock.mock.calls, ...fetchSpy.mock.calls].filter(
        ([url]) => typeof url === "string" && url.includes("/api/chat"),
      );
      expect(chatCalls).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
