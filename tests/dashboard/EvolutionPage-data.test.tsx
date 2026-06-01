// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import EvolutionPage from "../../src/dashboard/src/pages/EvolutionPage";

const mockUseApi = vi.fn();

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: (...args: unknown[]) => mockUseApi(...args),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("no server")),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("no server"));
  mockUseApi.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
});

function renderPage() {
  return render(
    <LanguageProvider>
      <EvolutionPage />
    </LanguageProvider>,
  );
}

const GENEALOGY_DATA = {
  roots: ["refactorer"],
  nodes: {
    refactorer: { agentId: "refactorer", parentId: null, createdAt: "2026-01-01", reason: "origin" },
  },
  edges: [],
};

describe("EvolutionPage — data loading, error, and Authorization states (216-011)", () => {
  it("shows loading skeleton when useApi returns loading=true", () => {
    mockUseApi.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderPage();

    expect(screen.getByTestId("evolution-page")).toBeTruthy();
    // While loading, no tree or error should be shown
    expect(screen.queryByTestId("genealogy-tree")).toBeNull();
    expect(screen.queryByTestId("evolution-error")).toBeNull();
  });

  it("shows error state when API returns a non-401 error", () => {
    mockUseApi.mockImplementation((url: string) => {
      if (url === "/api/evolution/genealogy") {
        return {
          data: null,
          loading: false,
          error: "GET /api/evolution/genealogy failed: Internal Server Error",
          refetch: vi.fn(),
        };
      }
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderPage();

    const errorEl = screen.getByTestId("evolution-error");
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain("failed");
    // No tree shown when error
    expect(screen.queryByTestId("genealogy-tree")).toBeNull();
  });

  it("shows 401 unauthorized message in error state", () => {
    mockUseApi.mockImplementation((url: string) => {
      if (url === "/api/evolution/genealogy") {
        return {
          data: null,
          loading: false,
          error: "GET /api/evolution/genealogy unauthorized",
          refetch: vi.fn(),
        };
      }
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderPage();

    const errorEl = screen.getByTestId("evolution-error");
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain("unauthorized");
    expect(screen.queryByTestId("genealogy-tree")).toBeNull();
  });

  it("shows empty states when all endpoints return null data (no error)", () => {
    mockUseApi.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderPage();

    // Genealogy tab (default) — empty state
    expect(screen.getByText("No genealogy data")).toBeTruthy();
    expect(screen.queryByTestId("evolution-error")).toBeNull();

    // Retirement tab — empty state
    fireEvent.click(screen.getByTestId("tab-retirement"));
    expect(screen.getByText("No retired agents")).toBeTruthy();

    // Prompt-diff tab — empty state
    fireEvent.click(screen.getByTestId("tab-prompt-diff"));
    expect(screen.getByText("No prompt metrics")).toBeTruthy();
  });

  it("renders genealogy data successfully when API returns results", () => {
    mockUseApi.mockImplementation((url: string) => {
      if (url === "/api/evolution/genealogy") {
        return { data: GENEALOGY_DATA, loading: false, error: null, refetch: vi.fn() };
      }
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderPage();

    expect(screen.getByTestId("genealogy-tree")).toBeTruthy();
    expect(screen.getByTestId("genealogy-node-refactorer")).toBeTruthy();
    expect(screen.queryByTestId("evolution-error")).toBeNull();
  });

  it("shows error in retirement tab when retirement endpoint fails", () => {
    mockUseApi.mockImplementation((url: string) => {
      if (url === "/api/evolution/retirement") {
        return {
          data: null,
          loading: false,
          error: "GET /api/evolution/retirement unauthorized",
          refetch: vi.fn(),
        };
      }
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderPage();

    fireEvent.click(screen.getByTestId("tab-retirement"));
    const errorEl = screen.getByTestId("evolution-error");
    expect(errorEl.textContent).toContain("unauthorized");
    expect(screen.queryByTestId("retirement-timeline")).toBeNull();
  });
});
