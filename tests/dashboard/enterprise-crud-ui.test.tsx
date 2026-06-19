// @vitest-environment happy-dom
// EnterprisePage RBAC + Rate-limit CRUD UI — DASH-D3.
// Mirrors EnterprisePage.test.tsx: mocks useApi for data and useAuth for the
// admin/viewer gate. Hermetic — no network, no gitignored state; fetch is mocked.

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

describe("EnterprisePage — RBAC role CRUD (DASH-D3)", () => {
  it("admin identity → 'New role' create button is visible in RBAC tab", () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rbac"] = RBAC;
    renderPage();
    fireEvent.click(screen.getByTestId("tab-rbac"));

    expect(screen.getByTestId("rbac-create-btn")).toBeTruthy();
    expect(screen.getByTestId("rbac-edit-admin")).toBeTruthy();
    expect(screen.getByTestId("rbac-delete-admin")).toBeTruthy();
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

  it("create submit POSTs role + permissions to /api/enterprise/rbac", async () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rbac"] = RBAC;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByTestId("tab-rbac"));
    fireEvent.click(screen.getByTestId("rbac-create-btn"));

    fireEvent.change(screen.getByTestId("rbac-form-role"), { target: { value: "auditor" } });
    fireEvent.change(screen.getByTestId("rbac-form-permissions"), { target: { value: "read, write" } });
    fireEvent.click(screen.getByTestId("rbac-form-submit"));

    await waitFor(() => expect(findCall(fetchMock, "/api/enterprise/rbac", "POST")).toBeTruthy());
    const call = findCall(fetchMock, "/api/enterprise/rbac", "POST")!;
    const [path, opts] = call;
    expect(path).toBe("/api/enterprise/rbac");
    expect(JSON.parse(opts.body)).toEqual({ role: "auditor", permissions: ["read", "write"] });
    expect(opts.headers["Authorization"]).toBe("Bearer tkn");
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it("edit submit PUTs permissions to /api/enterprise/rbac/:role", async () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rbac"] = RBAC;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByTestId("tab-rbac"));
    fireEvent.click(screen.getByTestId("rbac-edit-operator"));
    fireEvent.change(screen.getByTestId("rbac-form-permissions"), { target: { value: "read" } });
    fireEvent.click(screen.getByTestId("rbac-form-submit"));

    await waitFor(() => expect(findCall(fetchMock, "/api/enterprise/rbac/operator", "PUT")).toBeTruthy());
    const [path, opts] = findCall(fetchMock, "/api/enterprise/rbac/operator", "PUT")!;
    expect(path).toBe("/api/enterprise/rbac/operator");
    expect(JSON.parse(opts.body)).toEqual({ permissions: ["read"] });
  });
});

describe("EnterprisePage — Rate-limit rule CRUD (DASH-D3)", () => {
  it("admin identity → 'New rate rule' create button + row actions visible", () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rate"] = RATE;
    renderPage();
    fireEvent.click(screen.getByTestId("tab-rate"));

    expect(screen.getByTestId("rate-create-btn")).toBeTruthy();
    expect(screen.getByTestId("rate-edit-/api/sprints")).toBeTruthy();
    expect(screen.getByTestId("rate-delete-/api/sprints")).toBeTruthy();
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

  it("create submit POSTs id + endpoint + limit to /api/enterprise/rate", async () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rate"] = RATE;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByTestId("tab-rate"));
    fireEvent.click(screen.getByTestId("rate-create-btn"));

    fireEvent.change(screen.getByTestId("rate-form-id"), { target: { value: "api-retro" } });
    fireEvent.change(screen.getByTestId("rate-form-endpoint"), { target: { value: "/api/retro" } });
    fireEvent.change(screen.getByTestId("rate-form-limit"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("rate-form-submit"));

    await waitFor(() => expect(findCall(fetchMock, "/api/enterprise/rate", "POST")).toBeTruthy());
    const [path, opts] = findCall(fetchMock, "/api/enterprise/rate", "POST")!;
    expect(path).toBe("/api/enterprise/rate");
    expect(JSON.parse(opts.body)).toEqual({ id: "api-retro", endpoint: "/api/retro", limit: 25 });
    expect(opts.headers["Authorization"]).toBe("Bearer tkn");
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it("invalid (non-positive) limit surfaces a validation error and does not fetch", async () => {
    mockIdentity = ADMIN;
    mockDataMap["/api/enterprise/rate"] = RATE;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByTestId("tab-rate"));
    fireEvent.click(screen.getByTestId("rate-create-btn"));
    fireEvent.change(screen.getByTestId("rate-form-id"), { target: { value: "bad" } });
    fireEvent.change(screen.getByTestId("rate-form-endpoint"), { target: { value: "/api/bad" } });
    fireEvent.change(screen.getByTestId("rate-form-limit"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("rate-form-submit"));

    await waitFor(() => expect(screen.getByTestId("rate-mutation-error")).toBeTruthy());
    // Client-side validation blocks the mutation — no enterprise rate POST fires
    // (unrelated bootstrap GETs may still occur, so assert on the rate path only).
    expect(findCall(fetchMock, "/api/enterprise/rate", "POST")).toBeUndefined();
  });
});
