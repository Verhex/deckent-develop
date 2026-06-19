// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DockPanel } from '../../../src/dashboard/src/components/DockPanel';
import { LanguageProvider } from '../../../src/dashboard/src/i18n/LanguageProvider';

// DA-T.1: DockPanel now gates on terminal availability (renders null without a
// bootstrap token). These behavior tests exercise the dock chrome, so they set
// the terminal-available precondition by stubbing getBootstrapToken to a token.
vi.mock('../../../src/dashboard/src/lib/terminal-api.js', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return { ...actual, getBootstrapToken: () => 'tok-test' };
});

function renderDock(body: string) {
  return render(
    <LanguageProvider>
      <DockPanel>
        <div>{body}</div>
      </DockPanel>
    </LanguageProvider>,
  );
}

describe('DockPanel', () => {
  it('starts collapsed and toggles open via the terminal toggle button', () => {
    renderDock('PANELBODY');

    expect(screen.queryByText('PANELBODY')).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /terminal/i }));

    expect(screen.getByText('PANELBODY')).toBeVisible();
  });

  it('toggles back to collapsed on a second click', () => {
    renderDock('PANELBODY2');

    const toggle = screen.getByRole('button', { name: /terminal/i });
    fireEvent.click(toggle);
    expect(screen.getByText('PANELBODY2')).toBeVisible();
    fireEvent.click(toggle);
    expect(screen.getByText('PANELBODY2')).not.toBeVisible();
  });

  it('exposes a resize separator only when expanded', () => {
    renderDock('PANELBODY3');

    expect(screen.queryByRole('separator', { name: /resize terminal/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /terminal/i }));
    expect(screen.getByRole('separator', { name: /resize terminal/i })).toBeInTheDocument();
  });

  it('maximizes and restores the dock, hiding the resize separator while maximized', () => {
    const { container } = renderDock('PANELBODY4');
    const panel = container.querySelector('[data-dock-panel="true"]') as HTMLElement;

    // Maximize control is only available once the dock is expanded.
    expect(screen.queryByRole('button', { name: /maximize/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /terminal/i }));
    expect(panel).toHaveAttribute('data-maximized', 'false');

    fireEvent.click(screen.getByRole('button', { name: /maximize/i }));
    expect(panel).toHaveAttribute('data-maximized', 'true');
    // While maximized the drag-resize separator is suppressed (fixed 70vh).
    expect(screen.queryByRole('separator', { name: /resize terminal/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /restore/i }));
    expect(panel).toHaveAttribute('data-maximized', 'false');
  });
});
