// @vitest-environment happy-dom
// Tests for Sprint 277 Task 8 — dashboard SSO wire.
//
// Pattern: source-inspection for all routing/navigation tests (react-router-dom
// lives in src/dashboard/node_modules, not workspace root — component renders
// that use useNavigate/useLocation hit the dashboard's React instance and fail
// with a null-useContext error). This is the established pattern in this repo:
// AppShell.test.tsx, route-sidebar-wire.test.tsx, Layout.test.tsx all use
// source-inspection. Component render tests are used only for components that
// do NOT depend on react-router-dom internals.
//
// Covers:
//   1. App.tsx — AuthProvider wire + /login + /auth/callback routes
//   2. AppShell.tsx — AuthStatus imported + rendered in header
//   3. LoginPage.tsx — structure, OIDC functions used, SSO + manual-token
//   4. CallbackPage.tsx — structure, flow functions used, error handling

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Source paths ──────────────────────────────────────────────────────────────

const SRC = resolve(process.cwd(), 'src/dashboard/src');
const appPath = resolve(SRC, 'App.tsx');
const shellPath = resolve(SRC, 'components/AppShell.tsx');
const loginPath = resolve(SRC, 'pages/LoginPage.tsx');
const callbackPath = resolve(SRC, 'pages/CallbackPage.tsx');

const src = (p: string) => readFileSync(p, 'utf-8');

// ─── Mocks for AuthStatus render tests ────────────────────────────────────────

const mockLogout = vi.fn();

vi.mock('../../src/dashboard/src/hooks/useAuth.js', () => ({
  useAuth: vi.fn(() => ({
    token: 'tok',
    isAuthenticated: true,
    identity: { authenticated: true, mode: 'oidc', name: 'Alice', role: 'admin' },
    mode: 'oidc',
    login: vi.fn(),
    logout: mockLogout,
    refresh: vi.fn(),
  })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/dashboard/src/lib/api.js', () => ({
  getBootstrapApiToken: vi.fn(() => undefined),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

vi.mock('../../src/dashboard/src/i18n/LanguageProvider.js', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      let val = key;
      if (params) for (const [k, v] of Object.entries(params)) val = val.replace(`{{${k}}}`, v);
      return val;
    },
  }),
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/dashboard/src/components/ThemeProvider.js', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/dashboard/src/components/Sidebar.js', () => ({
  navItems: [],
}));

// React-router-dom mock — prevents resolution error when AppShell is rendered.
vi.mock('react-router-dom', () => ({
  NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ search: '', pathname: '/', hash: '', state: null }),
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MemoryRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => {
  vi.clearAllMocks();
});

// ─── 1. App.tsx — AuthProvider wire ──────────────────────────────────────────

describe('App.tsx — AuthProvider + route wire', () => {
  it('imports AuthProvider from hooks/useAuth', () => {
    expect(src(appPath)).toContain('AuthProvider');
  });

  it('wraps the tree with <AuthProvider>', () => {
    const content = src(appPath);
    expect(content).toContain('<AuthProvider>');
    expect(content).toContain('</AuthProvider>');
  });

  it('has /login route', () => {
    expect(src(appPath)).toContain('path="/login"');
  });

  it('has /auth/callback route', () => {
    expect(src(appPath)).toContain('path="/auth/callback"');
  });

  it('imports LoginPage and CallbackPage', () => {
    const content = src(appPath);
    expect(content).toContain('LoginPage');
    expect(content).toContain('CallbackPage');
  });
});

// ─── 2. AppShell.tsx — AuthStatus in header ──────────────────────────────────

describe('AppShell.tsx — AuthStatus header integration', () => {
  it('imports AuthStatus', () => {
    expect(src(shellPath)).toContain('AuthStatus');
  });

  it('imports AuthStatus from ./AuthStatus.js', () => {
    expect(src(shellPath)).toContain('AuthStatus.js');
  });

  it('renders <AuthStatus /> inside the header block', () => {
    const content = src(shellPath);
    expect(content).toContain('<AuthStatus');
  });

  it('AuthStatus is placed inside the header element (not sidebar or main)', () => {
    const content = src(shellPath);
    // Find the position of the header block and <AuthStatus — must be inside header
    const headerIdx = content.indexOf('data-testid="app-shell-header"');
    const authStatusIdx = content.indexOf('<AuthStatus');
    const mainIdx = content.indexOf('data-testid="app-shell-main"');
    expect(headerIdx).toBeGreaterThan(0);
    expect(authStatusIdx).toBeGreaterThan(headerIdx);
    expect(authStatusIdx).toBeLessThan(mainIdx);
  });
});

// ─── 3. LoginPage.tsx — source structure ─────────────────────────────────────

describe('LoginPage.tsx — source structure', () => {
  it('file exists at expected path', () => {
    expect(existsSync(loginPath)).toBe(true);
  });

  it('uses useAuth hook for isAuthenticated', () => {
    expect(src(loginPath)).toContain('useAuth');
    expect(src(loginPath)).toContain('isAuthenticated');
  });

  it('uses useNavigate for redirect', () => {
    expect(src(loginPath)).toContain('useNavigate');
    expect(src(loginPath)).toContain("navigate('/'");
  });

  it('includes ManualTokenInput component', () => {
    expect(src(loginPath)).toContain('ManualTokenInput');
  });

  it('uses generatePkce from oidc-flow', () => {
    expect(src(loginPath)).toContain('generatePkce');
  });

  it('uses buildAuthorizeUrl and persistFlowSession', () => {
    const content = src(loginPath);
    expect(content).toContain('buildAuthorizeUrl');
    expect(content).toContain('persistFlowSession');
  });

  it('has sso-login-button testid (conditionally rendered)', () => {
    expect(src(loginPath)).toContain('sso-login-button');
  });

  it('has manual-token-open-button testid (always rendered)', () => {
    expect(src(loginPath)).toContain('manual-token-open-button');
  });

  it('fetches /api/config to check dashboard_oidc.enabled', () => {
    const content = src(loginPath);
    expect(content).toContain('/api/config');
    expect(content).toContain('dashboard_oidc');
  });

  it('default-off: SSO block is conditional on oidcConfig being set', () => {
    const content = src(loginPath);
    // The SSO button is inside a conditional render (oidcConfig && ...)
    expect(content).toContain('oidcConfig');
  });
});

// ─── 4. CallbackPage.tsx — source structure ──────────────────────────────────

describe('CallbackPage.tsx — source structure', () => {
  it('file exists at expected path', () => {
    expect(existsSync(callbackPath)).toBe(true);
  });

  it('uses parseCallbackParams from oidc-flow', () => {
    expect(src(callbackPath)).toContain('parseCallbackParams');
  });

  it('uses validateState for CSRF protection', () => {
    expect(src(callbackPath)).toContain('validateState');
  });

  it('uses loadFlowSession to retrieve stored verifier + state', () => {
    expect(src(callbackPath)).toContain('loadFlowSession');
  });

  it('calls clearFlowSession after handling', () => {
    expect(src(callbackPath)).toContain('clearFlowSession');
  });

  it('calls login() on successful exchange', () => {
    const content = src(callbackPath);
    expect(content).toContain('login(');
    expect(content).toContain("navigate('/'");
  });

  it('navigates to /login?error= on error paths', () => {
    const content = src(callbackPath);
    expect(content).toContain('/login?error=');
  });

  it('calls POST /api/auth/oidc/exchange with code + code_verifier', () => {
    const content = src(callbackPath);
    expect(content).toContain('/api/auth/oidc/exchange');
    expect(content).toContain('code_verifier');
    expect(content).toContain("method: 'POST'");
  });

  it('renders callback-page testid', () => {
    expect(src(callbackPath)).toContain('data-testid="callback-page"');
  });
});
