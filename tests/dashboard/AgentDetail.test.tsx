// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import { AgentDetail } from "../../src/dashboard/src/components/AgentDetail";

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

// ─── Helpers ────────────────────────────────────────────────────────

function mockFetchResponse(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(data),
  });
}

const SAMPLE_LOG_DATA = {
  taskId: "001-001",
  log: "Building project...\ntsc --noEmit passed\nAll tests passed.",
  task: {
    title: "Implement auth middleware",
    status: "EXECUTING",
    model: "sonnet",
    description: "Add JWT auth middleware to API routes",
    scope: {
      directories: ["src/middleware/", "src/routes/"],
      filesWrite: ["src/middleware/auth.ts"],
    },
  },
};

// ─── Tests ──────────────────────────────────────────────────────────

describe("AgentDetail component", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("renders with the task ID in the header", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Worker 001-001/)).toBeTruthy();
    });
  });

  it("displays model badge when task data loads", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("sonnet")).toBeTruthy();
    });
  });

  it("displays status badge when task data loads", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("EXECUTING")).toBeTruthy();
    });
  });

  it("displays task title", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Implement auth middleware")).toBeTruthy();
    });
  });

  it("displays task description", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Add JWT auth middleware to API routes")).toBeTruthy();
    });
  });

  it("displays scope directories", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("src/middleware/, src/routes/")).toBeTruthy();
    });
  });

  it("displays log output", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Building project/)).toBeTruthy();
      expect(screen.getByText(/All tests passed/)).toBeTruthy();
    });
  });

  it("shows 'No log output yet.' when log is null", async () => {
    globalThis.fetch = mockFetchResponse({
      taskId: "001-001",
      log: null,
      task: null,
    });
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("No log output yet.")).toBeTruthy();
    });
  });

  it("calls onClose when close button is clicked", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    const closeButton = screen.getByLabelText("Close");
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fetches from correct API endpoint with taskId", async () => {
    const fetchMock = mockFetchResponse(SAMPLE_LOG_DATA);
    globalThis.fetch = fetchMock;
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="002-003" onClose={onClose} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/worker/002-003/log");
    });
  });

  it("supports custom apiBase prop", async () => {
    const fetchMock = mockFetchResponse(SAMPLE_LOG_DATA);
    globalThis.fetch = fetchMock;
    const onClose = vi.fn();

    render(
      <AgentDetail
        taskId="001-001"
        onClose={onClose}
        apiBase="http://localhost:3100"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3100/api/worker/001-001/log",
      );
    });
  });

  it("polls for updates every 3 seconds", async () => {
    const fetchMock = mockFetchResponse(SAMPLE_LOG_DATA);
    globalThis.fetch = fetchMock;
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    // Wait for initial worker log fetch (LanguageProvider also fetches /api/config on mount)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/worker/001-001/log");
    });

    const logCallsBefore = fetchMock.mock.calls.filter(
      (c: string[]) => c[0] === "/api/worker/001-001/log",
    ).length;

    // Advance timers by 3 seconds
    vi.advanceTimersByTime(3000);

    await waitFor(() => {
      const logCalls = fetchMock.mock.calls.filter(
        (c: string[]) => c[0] === "/api/worker/001-001/log",
      ).length;
      expect(logCalls).toBe(logCallsBefore + 1);
    });

    // Advance another 3 seconds
    vi.advanceTimersByTime(3000);

    await waitFor(() => {
      const logCalls = fetchMock.mock.calls.filter(
        (c: string[]) => c[0] === "/api/worker/001-001/log",
      ).length;
      expect(logCalls).toBe(logCallsBefore + 2);
    });
  });

  it("stops polling on unmount", async () => {
    const fetchMock = mockFetchResponse(SAMPLE_LOG_DATA);
    globalThis.fetch = fetchMock;
    const onClose = vi.fn();

    const { unmount } = render(
      <AgentDetail taskId="001-001" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    // Advance timers — should NOT trigger more fetches
    vi.advanceTimersByTime(10000);

    // Still only 1 call (the initial fetch)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not show model badge when task has no model", async () => {
    globalThis.fetch = mockFetchResponse({
      taskId: "001-001",
      log: "Running...",
      task: { title: "Basic task", status: "EXECUTING" },
    });
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Basic task")).toBeTruthy();
    });

    // The model badge should not exist
    expect(screen.queryByText("sonnet")).toBeNull();
    expect(screen.queryByText("opus")).toBeNull();
    expect(screen.queryByText("haiku")).toBeNull();
  });

  it("does not show scope section when directories are empty", async () => {
    globalThis.fetch = mockFetchResponse({
      taskId: "001-001",
      log: "Working...",
      task: {
        title: "No scope task",
        status: "EXECUTING",
        scope: { directories: [] },
      },
    });
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("No scope task")).toBeTruthy();
    });

    expect(screen.queryByText("Scope:")).toBeNull();
  });

  it("handles fetch error gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const onClose = vi.fn();

    // Should not throw
    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    // Should show default state
    await waitFor(() => {
      expect(screen.getByText("No log output yet.")).toBeTruthy();
    });
  });

  it("renders Log Output label", async () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    expect(screen.getByText("Log Output")).toBeTruthy();
  });

  it("has close button with correct aria-label", () => {
    globalThis.fetch = mockFetchResponse(SAMPLE_LOG_DATA);
    const onClose = vi.fn();

    renderWithProviders(<AgentDetail taskId="001-001" onClose={onClose} />);

    const closeButton = screen.getByLabelText("Close");
    expect(closeButton).toBeTruthy();
    expect(closeButton.tagName).toBe("BUTTON");
  });
});
