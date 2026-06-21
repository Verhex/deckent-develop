// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// Mock the i18n provider — return the key so assertions are language-agnostic
// (mirrors the dashboard's existing test convention, e.g. manual-token-input.test).
vi.mock('../../src/dashboard/src/i18n/LanguageProvider.js', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { UnauthorizedBanner } from '../../src/dashboard/src/components/UnauthorizedBanner.js';

describe('UnauthorizedBanner', () => {
  afterEach(() => cleanup());

  it('renders nothing until a deckent:unauthorized event fires', () => {
    render(<UnauthorizedBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces the 401 banner when deckent:unauthorized is dispatched (the listener that was missing)', () => {
    render(<UnauthorizedBanner />);
    // Before this component existed nothing listened for the event the API client
    // dispatches on a 401 — the failure was silent. The banner must now appear.
    act(() => {
      window.dispatchEvent(new CustomEvent('deckent:unauthorized'));
    });
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('auth.unauthorized.title');
    expect(alert.textContent).toContain('auth.unauthorized.message');
  });

  it('dismisses the banner when the close button is clicked', () => {
    render(<UnauthorizedBanner />);
    act(() => {
      window.dispatchEvent(new CustomEvent('deckent:unauthorized'));
    });
    expect(screen.queryByRole('alert')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes its listener on unmount (post-unmount event is a no-op, no leak)', () => {
    const { unmount } = render(<UnauthorizedBanner />);
    unmount();
    act(() => {
      window.dispatchEvent(new CustomEvent('deckent:unauthorized'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
