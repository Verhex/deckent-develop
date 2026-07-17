// @vitest-environment happy-dom
// EnterprisePage RBAC + Rate-limit — SURF-7 (ADR-G-033) read-only cutover:
// even admin identity sees NO CRUD controls (canManage is force-false).
// Mirrors EnterprisePage.test.tsx: mocks useApi for data and useAuth for the
// identity. Hermetic — no network, no gitignored state; fetch is mocked.

import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import type { AuthIdentity } from "../../src/dashboard/src/hooks/useAuth";

const mockRefetch = vi.fn();

const RBAC = [
  { role: "admin", permissions: ["read", "write", "delete", "admin"] },
  { role: "operator", permissions: ["read", "write"] },
  { role: "viewer", permissions: ["read"] },
];

const RATE = [
  { endpoint: "/api/sprints", limit: 100, remaining: 75, resetAt: "2026-06-01T12:00:00Z" },
  { endpoint: "/api/tenants", limit: 50, remaining: 5, resetAt: "2026-06-01T12:00:00Z" },
];

let mockDataMap: Record<string, unknown> = {};
let mockIdentity: AuthIdentity | null = null;

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => ({
    data: mockDataMap[url] ?? null,
    loading: false,
    error: null,
    refetch: mockRefetch,
  })),
}));

vi.mock("../../src/dashboard/src/hooks/useAuth.js", () => ({
  useAuth: vi.fn(() => ({
    token: "tkn",
    isAuthenticated: mockIdentity !== null,
    identity: mockIdentity,
    mode: mockIdentity?.mode ?? null,
    login: async () => {},
    logout: () => {},
    refresh: async () => {},
  })),
}));

const ADMIN: AuthIdentity = { authenticated: true, mode: "oidc", role: "admin" };
const VIEWER: AuthIdentity = { authenticated: true, mode: "oidc", role: "viewer" };

beforeEach(() => {
  // Bootstrap a bearer token so the mutate() fetch attaches Authorization.
  (window as unknown as { __DECKENT_API_TOKEN__?: string }).__DECKENT_API_TOKEN__ = "tkn";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockDataMap = {};
  mockIdentity = null;
  delete (window as unknown as { __DECKENT_API_TOKEN__?: string }).__DECKENT_API_TOKEN__;
});

import EnterprisePage from "../../src/dashboard/src/pages/EnterprisePage";

// The page's auth bootstrap effect (useAuth/AuthProvider is real-rendered via
// other hooks) may issue unrelated GETs (e.g. /api/config). Pick the mutation
// call we care about by its enterprise path + method so the test is robust.
function findCall(fetchMock: ReturnType<typeof vi.fn>, prefix: string, method: string) {
  return fetchMock.mock.calls.find(
    ([url, opts]) => typeof url === "string" && url.startsWith(prefix) && (opts as { method?: string })?.method === method,
  ) as [string, { method: string; body: string; headers: Record<string, string> }] | undefined;
}

function renderPage() {
  return render(
    <LanguageProvider>
      <EnterprisePage />
    </LanguageProvider>,
  );
}

// SURF-7 (ADR-G-033): read-only cutover pin
describe("EnterprisePage — RBAC read-only (SURF-7)", () => {
  it("admin identity → NO create/edit/delete controls; readonly notice + matrix render", () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rbac"] = RBAC;
    renderPage();
    fireEvent.click(screen.getByTestId("tab-rbac"));

    // Even admin sees no mutation controls — canManage is force-false.
    expect(screen.queryByTestId("rbac-create-btn")).toBeNull();
    expect(screen.queryByTestId("rbac-edit-admin")).toBeNull();
    expect(screen.queryByTestId("rbac-delete-admin")).toBeNull();
    expect(screen.queryByTestId("rbac-form")).toBeNull();
    // Read view stays: notice + role matrix.
    expect(screen.getByTestId("readonly-notice")).toBeTruthy();
    expect(screen.getByTestId("rbac-matrix")).toBeTruthy();
  });

  it("viewer identity → create/edit/delete actions hidden in RBAC tab", () => {
    mockIdentity = VIEWER;
    mockDataMap["/api/enterprise/rbac"] = RBAC;
    renderPage();
    fireEvent.click(screen.getByTestId("tab-rbac"));

    expect(screen.queryByTestId("rbac-create-btn")).toBeNull();
    expect(screen.queryByTestId("rbac-edit-admin")).toBeNull();
    expect(screen.queryByTestId("rbac-delete-admin")).toBeNull();
  });

  it("admin identity → no enterprise mutation fetch can fire from the RBAC tab", async () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rbac"] = RBAC;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByTestId("tab-rbac"));

    await waitFor(() => expect(screen.getByTestId("rbac-matrix")).toBeTruthy());
    expect(findCall(fetchMock, "/api/enterprise/rbac", "POST")).toBeUndefined();
    expect(findCall(fetchMock, "/api/enterprise/rbac", "PUT")).toBeUndefined();
    expect(findCall(fetchMock, "/api/enterprise/rbac", "DELETE")).toBeUndefined();
    expect(mockRefetch).not.toHaveBeenCalled();
  });
});

// SURF-7 (ADR-G-033): read-only cutover pin
describe("EnterprisePage — Rate-limit read-only (SURF-7)", () => {
  it("admin identity → NO create/edit/delete controls; rate status still renders", () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rate"] = RATE;
    renderPage();
    fireEvent.click(screen.getByTestId("tab-rate"));

    expect(screen.queryByTestId("rate-create-btn")).toBeNull();
    expect(screen.queryByTestId("rate-edit-/api/sprints")).toBeNull();
    expect(screen.queryByTestId("rate-delete-/api/sprints")).toBeNull();
    expect(screen.queryByTestId("rate-form")).toBeNull();
    // Read view stays: notice + rate status list.
    expect(screen.getByTestId("readonly-notice")).toBeTruthy();
    expect(screen.getByTestId("rate-status")).toBeTruthy();
  });

  it("viewer identity → create/edit/delete actions hidden in Rate tab", () => {
    mockIdentity = VIEWER;
    mockDataMap["/api/enterprise/rate"] = RATE;
    renderPage();
    fireEvent.click(screen.getByTestId("tab-rate"));

    expect(screen.queryByTestId("rate-create-btn")).toBeNull();
    expect(screen.queryByTestId("rate-edit-/api/sprints")).toBeNull();
    expect(screen.queryByTestId("rate-delete-/api/sprints")).toBeNull();
  });

  it("admin identity → no enterprise mutation fetch can fire from the Rate tab", async () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rate"] = RATE;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByTestId("tab-rate"));

    await waitFor(() => expect(screen.getByTestId("rate-status")).toBeTruthy());
    expect(findCall(fetchMock, "/api/enterprise/rate", "POST")).toBeUndefined();
    expect(findCall(fetchMock, "/api/enterprise/rate", "PUT")).toBeUndefined();
    expect(findCall(fetchMock, "/api/enterprise/rate", "DELETE")).toBeUndefined();
    expect(mockRefetch).not.toHaveBeenCalled();
  });
});
