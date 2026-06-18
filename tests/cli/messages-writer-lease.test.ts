import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';

describe('mcp.writer_lease.denied message', () => {
  it('renders English with tool + pid filled', () => {
    const msg = getMessage('mcp.writer_lease.denied', 'en', { tool: 'deckent_start', pid: '4242' });
    expect(msg).toContain('deckent_start');
    expect(msg).toContain('4242');
    expect(msg).not.toContain('{tool}');
    expect(msg).not.toContain('{pid}');
  });

  it('renders Turkish with tool + pid filled', () => {
    const msg = getMessage('mcp.writer_lease.denied', 'tr', { tool: 'deckent_start', pid: '4242' });
    expect(msg).toContain('deckent_start');
    expect(msg).toContain('4242');
    expect(msg).not.toContain('{tool}');
  });
});
