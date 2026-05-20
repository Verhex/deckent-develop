import { describe, it, expect, vi } from 'vitest';
import { getBootstrapToken, createSession } from '../../../src/dashboard/src/lib/terminal-api.js';

describe('terminal-api', () => {
  it('reads the injected bootstrap token', () => {
    (window as unknown as Record<string, unknown>).__DECKENT_TERMINAL_TOKEN__ = 'tok-1';
    expect(getBootstrapToken()).toBe('tok-1');
  });
  it('POSTs a session create', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 's1' }) });
    vi.stubGlobal('fetch', fetchMock);
    const r = await createSession({ kind: 'shell' });
    expect(r.id).toBe('s1');
    expect(fetchMock).toHaveBeenCalledWith('/api/terminal/sessions', expect.objectContaining({ method: 'POST' }));
  });
});
