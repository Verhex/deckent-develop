// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DockPanel } from '../../../src/dashboard/src/components/DockPanel';

describe('DockPanel', () => {
  it('starts collapsed and toggles open via the terminal toggle button', () => {
    render(
      <DockPanel>
        <div>PANELBODY</div>
      </DockPanel>,
    );

    expect(screen.queryByText('PANELBODY')).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /terminal/i }));

    expect(screen.getByText('PANELBODY')).toBeVisible();
  });

  it('toggles back to collapsed on a second click', () => {
    render(
      <DockPanel>
        <div>PANELBODY2</div>
      </DockPanel>,
    );

    const toggle = screen.getByRole('button', { name: /terminal/i });
    fireEvent.click(toggle);
    expect(screen.getByText('PANELBODY2')).toBeVisible();
    fireEvent.click(toggle);
    expect(screen.getByText('PANELBODY2')).not.toBeVisible();
  });

  it('exposes a resize separator only when expanded', () => {
    render(
      <DockPanel>
        <div>PANELBODY3</div>
      </DockPanel>,
    );

    expect(screen.queryByRole('separator', { name: /resize terminal/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /terminal/i }));
    expect(screen.getByRole('separator', { name: /resize terminal/i })).toBeInTheDocument();
  });
});
