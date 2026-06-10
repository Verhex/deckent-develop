// @vitest-environment happy-dom
// Tests for AuthStatus component (Sprint 277, ENT-5).
// Mix of source-inspection (structure/i18n checks) and RTL render tests
// (identity render, logout interaction).

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Source-inspection helpers ────────────────────────────────────────────────

const COMPONENT_PATH = resolve(
  process.cwd(),
  'src/dashboard/src/components/AuthStatus.tsx',
);
const src = () => readFileSync(COMPONENT_PATH, 'utf-8');

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/dashboard/src/hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../src/dashboard/src/lib/api.js', () => ({
  getBootstrapApiToken: vi.fn<[], string | undefined>().mockReturnValue(undefined),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

const MOCK_TRANSLATIONS: Record<string, string> = {
  'auth.logged_in_as': 'Logged in as: {{name}}',
  'auth.local_session': 'Local session',
  'auth.logout': 'Log out',
  'auth.role': 'Role: {{role}}',
  'auth.session_cleared': 'Session cleared',
};

vi.mock('../../src/dashboard/src/i18n/LanguageProvider.js', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let val = MOCK_TRANSLATIONS[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          val = val.replace(`{{${k}}}`, String(v));
        }
      }
      return val;
    },
  }),
}));

import { useAuth } from '../../src/dashboard/src/hooks/useAuth.js';
import { getBootstrapApiToken } from '../../src/dashboard/src/lib/api.js';
import { AuthStatus } from '../../src/dashboard/src/components/AuthStatus.js';

const mockUseAuth = vi.mocked(useAuth);
const mockGetBootstrapApiToken = vi.mocked(getBootstrapApiToken);

const OIDC_IDENTITY = {
  authenticated: true as const,
  mode: 'oidc' as const,
  sub: 'user-123',
  email: 'alice@example.com',
  name: 'Alice',
  preferredUsername: 'alice',
  role: 'admin',
};

const STATIC_IDENTITY = {
  authenticated: true as const,
  mode: 'static' as const,
};

function makeAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  return {
    token: 'test-token',
    isAuthenticated: true,
    identity: OIDC_IDENTITY,
    mode: 'oidc' as const,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

// ─── Source-inspection tests ──────────────────────────────────────────────────

describe('AuthStatus — file structure', () => {
  it('file exists at expected path', () => {
    expect(existsSync(COMPONENT_PATH)).toBe(true);
  });

  it('exports AuthStatus function component', () => {
    expect(src()).toContain('export function AuthStatus');
  });

  it('has data-testid="auth-status" attribute', () => {
    expect(src()).toContain('data-testid="auth-status"');
  });

  it('has data-testid="logout-button" attribute', () => {
    expect(src()).toContain('data-testid="logout-button"');
  });

  it('uses useAuth hook for identity and logout', () => {
    const content = src();
    expect(content).toContain('useAuth');
    expect(content).toContain('logout');
  });

  it('uses useTranslation for i18n — no hardcoded user-facing strings', () => {
    const content = src();
    expect(content).toContain('useTranslation');
    // auth.logged_in_as and auth.local_session keys must be referenced
    expect(content).toContain("auth.logged_in_as");
    expect(content).toContain("auth.local_session");
    expect(content).toContain("auth.logout");
  });

  it('uses Lucide icons — no emoji-presentation characters', () => {
    const content = src();
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    expect(emojiRe.test(content)).toBe(false);
    expect(content).toContain('lucide-react');
  });
});

// ─── Render tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBootstrapApiToken.mockReturnValue(undefined);
});

describe('AuthStatus — unauthenticated', () => {
  it('renders nothing when identity is null', () => {
    mockUseAuth.mockReturnValue(makeAuth({ identity: null, isAuthenticated: false, mode: null }));
    const { container } = render(<AuthStatus />);
    expect(container.firstChild).toBeNull();
  });
});

describe('AuthStatus — OIDC identity render', () => {
  it('renders auth-status root with logged-in name', () => {
    mockUseAuth.mockReturnValue(makeAuth());
    render(<AuthStatus />);
    const root = screen.getByTestId('auth-status');
    expect(root).toBeTruthy();
    // t('auth.logged_in_as', { name: 'Alice' }) → 'auth.logged_in_as Alice'
    expect(root.textContent).toContain('Alice');
  });

  it('renders role badge when identity has a role', () => {
    mockUseAuth.mockReturnValue(makeAuth());
    render(<AuthStatus />);
    // t('auth.role', { role: 'admin' }) → 'Role: admin'
    expect(screen.getByTestId('auth-status').textContent).toContain('Role: admin');
  });

  it('does not render role badge when role is absent', () => {
    const identityNoRole = { ...OIDC_IDENTITY, role: undefined };
    mockUseAuth.mockReturnValue(makeAuth({ identity: identityNoRole }));
    render(<AuthStatus />);
    expect(screen.getByTestId('auth-status').textContent).not.toContain('Role:');
  });
});

describe('AuthStatus — static mode render', () => {
  it('shows "Local session" for static mode', () => {
    mockUseAuth.mockReturnValue(
      makeAuth({ identity: STATIC_IDENTITY, mode: 'static' }),
    );
    render(<AuthStatus />);
    // t('auth.local_session') → 'Local session'
    expect(screen.getByTestId('auth-status').textContent).toContain('Local session');
  });
});

describe('AuthStatus — logout interaction', () => {
  it('renders logout button', () => {
    mockUseAuth.mockReturnValue(makeAuth());
    render(<AuthStatus />);
    expect(screen.getByTestId('logout-button')).toBeTruthy();
  });

  it('calls useAuth().logout() when logout button is clicked', () => {
    const logoutFn = vi.fn();
    mockUseAuth.mockReturnValue(makeAuth({ logout: logoutFn }));
    render(<AuthStatus />);
    fireEvent.click(screen.getByTestId('logout-button'));
    expect(logoutFn).toHaveBeenCalledTimes(1);
  });

  it('shows session-cleared hint after logout when bootstrap token persists', () => {
    const logoutFn = vi.fn();
    mockGetBootstrapApiToken.mockReturnValue('bootstrap-tok');
    mockUseAuth.mockReturnValue(makeAuth({ logout: logoutFn }));
    render(<AuthStatus />);
    fireEvent.click(screen.getByTestId('logout-button'));
    // t('auth.session_cleared') → 'Session cleared'
    expect(screen.getByTestId('auth-status').textContent).toContain('Session cleared');
  });
});
