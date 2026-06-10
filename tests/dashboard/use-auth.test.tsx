// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock lib/api.js before importing anything that depends on it.
vi.mock('../../src/dashboard/src/lib/api.js', () => ({
  getBootstrapApiToken: vi.fn<[], string | undefined>().mockReturnValue(undefined),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

import { getBootstrapApiToken } from '../../src/dashboard/src/lib/api.js';
import { AuthProvider, useAuth } from '../../src/dashboard/src/hooks/useAuth.js';
import { SESSION_TOKEN_KEY } from '../../src/dashboard/src/lib/session.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

const ME_OIDC = {
  authenticated: true as const,
  mode: 'oidc' as const,
  sub: 'user-123',
  email: 'alice@example.com',
  name: 'Alice',
  preferredUsername: 'alice',
  role: 'admin',
};

const ME_STATIC = { authenticated: true as const, mode: 'static' as const };

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function jsonFail(status = 401): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  vi.mocked(getBootstrapApiToken).mockReturnValue(undefined);
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useAuth — bootstrap token priority', () => {
  it('uses bootstrap token when both bootstrap and sessionStorage have tokens', async () => {
    vi.mocked(getBootstrapApiToken).mockReturnValue('bootstrap-tok');
    sessionStorage.setItem(SESSION_TOKEN_KEY, 'session-tok');
    mockFetch.mockResolvedValue(jsonOk(ME_STATIC));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.token).toBe('bootstrap-tok');
    });

    // /api/auth/me must be called with the bootstrap token
    const [[, opts]] = mockFetch.mock.calls as [string, RequestInit][][];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer bootstrap-tok',
    );
  });
});

describe('useAuth — sessionStorage fallback', () => {
  it('uses session token when bootstrap token is absent', async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, 'session-xyz');
    mockFetch.mockResolvedValue(jsonOk(ME_STATIC));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.token).toBe('session-xyz');
    });

    const [[, opts]] = mockFetch.mock.calls as [string, RequestInit][][];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer session-xyz',
    );
  });

  it('token is undefined and identity is null when neither source has a token', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});
    expect(result.current.token).toBeUndefined();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.identity).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useAuth — /api/auth/me identity fetch', () => {
  it('populates OIDC identity on mount when bearer returns JWT claims', async () => {
    vi.mocked(getBootstrapApiToken).mockReturnValue('jwt-token');
    mockFetch.mockResolvedValue(jsonOk(ME_OIDC));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(result.current.identity).toMatchObject({
      authenticated: true,
      mode: 'oidc',
      sub: 'user-123',
      email: 'alice@example.com',
      role: 'admin',
    });
    expect(result.current.mode).toBe('oidc');
  });

  it('populates static identity when bearer is an opaque token', async () => {
    vi.mocked(getBootstrapApiToken).mockReturnValue('opaque-tok');
    mockFetch.mockResolvedValue(jsonOk(ME_STATIC));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(result.current.mode).toBe('static');
  });
});

describe('useAuth — 401 path', () => {
  it('sets identity null and isAuthenticated false on 401 from /api/auth/me', async () => {
    vi.mocked(getBootstrapApiToken).mockReturnValue('bad-token');
    mockFetch.mockResolvedValue(jsonFail(401));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.identity).toBeNull();
    expect(result.current.mode).toBeNull();
  });
});

describe('useAuth — login', () => {
  it('stores token in sessionStorage and updates token state after login', async () => {
    mockFetch.mockResolvedValue(jsonOk(ME_OIDC));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('new-jwt-token');
    });

    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe('new-jwt-token');

    await waitFor(() => {
      expect(result.current.token).toBe('new-jwt-token');
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  it('calls /api/auth/me with the newly-set token after login', async () => {
    mockFetch.mockResolvedValue(jsonOk(ME_STATIC));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('manual-token');
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const calls = mockFetch.mock.calls as [string, RequestInit][];
    const meCall = calls.find(([url]) => url === '/api/auth/me');
    expect(meCall).toBeDefined();
    const authHeader = (meCall![1].headers as Record<string, string>)['Authorization'];
    expect(authHeader).toBe('Bearer manual-token');
  });
});

describe('useAuth — logout', () => {
  it('clears sessionStorage and resets identity on logout', async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, 'session-tok');
    mockFetch.mockResolvedValue(jsonOk(ME_OIDC));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => {
      result.current.logout();
    });

    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(result.current.identity).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('preserves bootstrap token reference after logout but resets identity', async () => {
    vi.mocked(getBootstrapApiToken).mockReturnValue('bootstrap-tok');
    mockFetch.mockResolvedValue(jsonOk(ME_STATIC));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => {
      result.current.logout();
    });

    // Bootstrap token cannot be cleared — it's server-injected on page load
    expect(result.current.token).toBe('bootstrap-tok');
    expect(result.current.identity).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
