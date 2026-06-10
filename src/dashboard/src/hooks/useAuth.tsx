// useAuth.tsx — dashboard auth-state SSOT (Sprint 277, ENT-5).
//
// Bootstrap priority: window.__DECKENT_API_TOKEN__ (localhost auto-inject) takes
// precedence over sessionStorage. This preserves existing behaviour for all
// localhost callers while adding session-token support for api_oidc/ManualTokenInput.
//
// App.tsx wiring is handled by Task 8 — this file only exports the context,
// provider, and hook.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { getBootstrapApiToken } from '../lib/api.js';
import { clearSessionToken, getSessionToken, setSessionToken } from '../lib/session.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mirror of AuthMeResponse from src/api/auth-me-endpoint.ts (display-only copy). */
export interface AuthIdentity {
  authenticated: true;
  mode: 'oidc' | 'static';
  sub?: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  role?: string;
}

export interface AuthContextValue {
  /** The active bearer token (bootstrap or session), or undefined if none. */
  token: string | undefined;
  /** True when /api/auth/me returned a valid identity for the current token. */
  isAuthenticated: boolean;
  /** Decoded identity from /api/auth/me, or null when unauthenticated / 401. */
  identity: AuthIdentity | null;
  /** 'oidc' when a JWT bearer was decoded, 'static' for opaque tokens, null when none. */
  mode: 'oidc' | 'static' | null;
  /** Store token in sessionStorage and refresh identity from /api/auth/me. */
  login: (token: string) => Promise<void>;
  /** Clear sessionStorage token and reset identity state. */
  logout: () => void;
  /** Re-fetch identity from /api/auth/me using the current token. */
  refresh: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve the initial bearer token: bootstrap (window inject) takes priority. */
function resolveInitialToken(): string | undefined {
  return getBootstrapApiToken() ?? getSessionToken();
}

/** Fetch /api/auth/me with an explicit bearer. Returns null on 401/error. */
async function fetchMe(token: string): Promise<AuthIdentity | null> {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthIdentity;
  } catch {
    return null;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  token: undefined,
  isAuthenticated: false,
  identity: null,
  mode: null,
  login: async () => {},
  logout: () => {},
  refresh: async () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | undefined>(resolveInitialToken);
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);

  // Re-fetch identity whenever the active token changes.
  useEffect(() => {
    if (!token) {
      setIdentity(null);
      return;
    }
    void fetchMe(token).then(setIdentity);
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) {
      setIdentity(null);
      return;
    }
    const me = await fetchMe(token);
    setIdentity(me);
  }, [token]);

  const login = useCallback(async (newToken: string) => {
    setSessionToken(newToken);
    setToken(newToken);
    // token state change triggers the effect which fetches identity
  }, []);

  const logout = useCallback(() => {
    clearSessionToken();
    // Fall back to bootstrap token if present (cannot be cleared — server-injected).
    setToken(getBootstrapApiToken());
    setIdentity(null);
  }, []);

  const value: AuthContextValue = {
    token,
    isAuthenticated: identity !== null,
    identity,
    mode: identity?.mode ?? null,
    login,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
