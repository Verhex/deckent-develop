// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../src/dashboard/src/components/terminal/TerminalView', () => ({
  TerminalView: ({ sessionId }: { sessionId: string }) => <div>{`view:${sessionId}`}</div>,
}));

const apiMocks = vi.hoisted(() => ({
  createSession: vi.fn(async () => ({ id: 's-new', kind: 'shell', status: 'running' })),
  listSessions: vi.fn(async () => [] as Array<{ id: string; kind: string; status: string }>),
  killSession: vi.fn(async () => {}),
}));

vi.mock('../../../src/dashboard/src/lib/terminal-api', () => apiMocks);

import { TerminalPanel } from '../../../src/dashboard/src/components/terminal/TerminalPanel';

describe('TerminalPanel', () => {
  beforeEach(() => {
    apiMocks.createSession.mockClear();
    apiMocks.listSessions.mockClear();
    apiMocks.killSession.mockClear();
    apiMocks.listSessions.mockImplementation(async () => []);
    apiMocks.createSession.mockImplementation(async () => ({
      id: 's-new',
      kind: 'shell',
      status: 'running',
    }));
  });

  it('opens a new shell tab on quick-launch', async () => {
    render(<TerminalPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+shell/i }));
    await waitFor(() => expect(screen.getByText('view:s-new')).toBeInTheDocument());
  });

  it('invokes killSession when the close button is clicked', async () => {
    apiMocks.listSessions.mockImplementationOnce(async () => [
      { id: 's-existing', kind: 'shell', status: 'running' },
    ]);
    render(<TerminalPanel />);
    const closeBtn = await screen.findByLabelText('close s-existing');
    fireEvent.click(closeBtn);
    await waitFor(() => expect(apiMocks.killSession).toHaveBeenCalledWith('s-existing'));
  });
});
