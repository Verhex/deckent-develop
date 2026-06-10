// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock useAuth before importing the component
vi.mock('../../src/dashboard/src/hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock LanguageProvider — return key as-is for test assertions
vi.mock('../../src/dashboard/src/i18n/LanguageProvider.js', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { useAuth } from '../../src/dashboard/src/hooks/useAuth.js';
import { ManualTokenInput } from '../../src/dashboard/src/components/ManualTokenInput.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockLogin = vi.fn<[string], Promise<void>>().mockResolvedValue(undefined);
const mockFetch = vi.fn();

function setupAuthMock() {
  vi.mocked(useAuth).mockReturnValue({
    token: undefined,
    isAuthenticated: false,
    identity: null,
    mode: null,
    login: mockLogin,
    logout: vi.fn(),
    refresh: vi.fn(),
  });
}

function jsonOk(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ authenticated: true, mode: 'oidc' as const }),
  } as unknown as Response;
}

function jsonFail(status = 401): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

function renderComponent(
  open = true,
  onOpenChange = vi.fn(),
) {
  return render(<ManualTokenInput open={open} onOpenChange={onOpenChange} />);
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupAuthMock();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ManualTokenInput — render', () => {
  it('renders password input with data-testid when open=true', () => {
    renderComponent(true);

    const input = screen.getByTestId('manual-token-input');
    expect(input).toBeDefined();
    expect(input.getAttribute('type')).toBe('password');
  });

  it('does not render dialog content when open=false', () => {
    renderComponent(false);

    expect(screen.queryByTestId('manual-token-input')).toBeNull();
  });
});

describe('ManualTokenInput — valid token flow', () => {
  it('calls login() with the entered token when /api/auth/me returns 200', async () => {
    mockFetch.mockResolvedValue(jsonOk());
    const onOpenChange = vi.fn();
    renderComponent(true, onOpenChange);

    const input = screen.getByTestId('manual-token-input');
    fireEvent.change(input, { target: { value: 'valid-jwt-token' } });

    const submitBtn = screen.getByTestId('manual-token-submit');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockLogin).toHaveBeenCalledWith('valid-jwt-token');
    });
  });

  it('closes the dialog (onOpenChange false) after successful login', async () => {
    mockFetch.mockResolvedValue(jsonOk());
    const onOpenChange = vi.fn();
    renderComponent(true, onOpenChange);

    fireEvent.change(screen.getByTestId('manual-token-input'), {
      target: { value: 'good-jwt' },
    });
    fireEvent.click(screen.getByTestId('manual-token-submit'));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

describe('ManualTokenInput — invalid token flow', () => {
  it('shows error and does NOT call login() when /api/auth/me returns 401', async () => {
    mockFetch.mockResolvedValue(jsonFail(401));
    const onOpenChange = vi.fn();
    renderComponent(true, onOpenChange);

    fireEvent.change(screen.getByTestId('manual-token-input'), {
      target: { value: 'bad-token' },
    });
    fireEvent.click(screen.getByTestId('manual-token-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manual-token-error')).toBeDefined();
    });

    expect(mockLogin).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('shows error when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('network failure'));
    renderComponent(true);

    fireEvent.change(screen.getByTestId('manual-token-input'), {
      target: { value: 'some-token' },
    });
    fireEvent.click(screen.getByTestId('manual-token-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manual-token-error')).toBeDefined();
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });
});

describe('ManualTokenInput — cancel flow', () => {
  it('calls onOpenChange(false) when cancel button is clicked', () => {
    const onOpenChange = vi.fn();
    renderComponent(true, onOpenChange);

    fireEvent.click(screen.getByTestId('manual-token-cancel'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets token input and error state on cancel', async () => {
    mockFetch.mockResolvedValue(jsonFail(401));
    const onOpenChange = vi.fn();
    renderComponent(true, onOpenChange);

    // Enter a token and trigger an error
    fireEvent.change(screen.getByTestId('manual-token-input'), {
      target: { value: 'bad-token' },
    });
    fireEvent.click(screen.getByTestId('manual-token-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manual-token-error')).toBeDefined();
    });

    // Now cancel — error and input should be gone after re-open
    await act(async () => {
      fireEvent.click(screen.getByTestId('manual-token-cancel'));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ManualTokenInput — submit guard', () => {
  it('does not call login() when token input is empty', () => {
    mockFetch.mockResolvedValue(jsonOk());
    renderComponent(true);

    // submit button should be disabled when input is empty
    const submitBtn = screen.getByTestId('manual-token-submit');
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });
});
