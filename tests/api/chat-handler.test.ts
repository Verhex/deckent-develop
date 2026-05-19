import { describe, it, expect } from 'vitest';

import { buildChatReply } from '../../src/api/chat-handler.js';

// /api/chat contract (ChatPage.tsx:273): POST { message } → { reply }.
// Minimal but real: status/help commands + helpful default (never a stub).

describe('buildChatReply', () => {
  it('answers a status query with the provided sprint status', () => {
    const reply = buildChatReply('status', { status: () => 'Sprint 175: 3/6 done, 0 blocked' });
    expect(reply).toContain('Sprint 175');
    expect(reply).toContain('3/6 done');
  });

  it('answers Turkish "durum" the same way', () => {
    const reply = buildChatReply('durum nedir?', { status: () => 'idle — no active sprint' });
    expect(reply).toContain('idle');
  });

  it('returns command guidance for help', () => {
    const reply = buildChatReply('help', {});
    expect(reply.toLowerCase()).toContain('status');
  });

  it('returns helpful guidance for an unrecognized message (not a stub error)', () => {
    const reply = buildChatReply('build me a rocket', {});
    expect(reply.length).toBeGreaterThan(0);
    expect(reply.toLowerCase()).not.toContain('not implemented');
    expect(reply.toLowerCase()).not.toContain('404');
  });

  it('handles empty message gracefully with guidance', () => {
    const reply = buildChatReply('   ', {});
    expect(reply.toLowerCase()).toContain('status');
  });
});
