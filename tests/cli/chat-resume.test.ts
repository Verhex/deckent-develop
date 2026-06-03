import { describe, it, expect } from 'vitest';
import {
  renderSessionList,
  resolveResumeTarget,
  renderResumedHistory,
} from '../../src/cli/commands/chat-resume.js';
import type { ChatSessionSummary } from '../../src/core/memory-types.js';

const SESSIONS: ChatSessionSummary[] = [
  { sessionId: 'sess-new', turnCount: 4, lastAt: '2026-06-03T10:30:00.000Z', preview: 'how do I deploy' },
  { sessionId: 'sess-old', turnCount: 2, lastAt: '2026-06-01T09:00:00.000Z', preview: 'docker question' },
];

describe('renderSessionList', () => {
  it('renders a numbered list with preview + turn count', () => {
    const out = renderSessionList(SESSIONS, 'en');
    expect(out).toContain('1. how do I deploy');
    expect(out).toContain('2. docker question');
    expect(out).toContain('4 turns');
    expect(out).toMatch(/tip:.*\/resume/i);
  });

  it('renders the empty-state message when there are no sessions', () => {
    expect(renderSessionList([], 'en')).toMatch(/no past chat sessions/i);
  });

  it('honors Turkish', () => {
    const out = renderSessionList(SESSIONS, 'tr');
    expect(out).toMatch(/geçmiş sohbet oturumları/i);
  });
});

describe('resolveResumeTarget', () => {
  it('maps a 1-based number to the Nth session id', () => {
    expect(resolveResumeTarget('1', SESSIONS)).toBe('sess-new');
    expect(resolveResumeTarget('2', SESSIONS)).toBe('sess-old');
  });

  it('returns null for an out-of-range number', () => {
    expect(resolveResumeTarget('9', SESSIONS)).toBeNull();
    expect(resolveResumeTarget('0', SESSIONS)).toBeNull();
  });

  it('treats a non-numeric arg as a literal session id', () => {
    expect(resolveResumeTarget('chat-123', SESSIONS)).toBe('chat-123');
  });

  it('returns null for a blank arg', () => {
    expect(resolveResumeTarget('   ', SESSIONS)).toBeNull();
  });
});

describe('renderResumedHistory', () => {
  it('renders a header + user/assistant prefixed turns', () => {
    const turns = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    const out = renderResumedHistory('sess-new', turns, 'en');
    expect(out).toMatch(/resuming session "sess-new" — last 2 turn/i);
    expect(out).toContain('› hello');
    expect(out).toContain('‹ hi there');
  });

  it('returns the not-found message for an empty history', () => {
    expect(renderResumedHistory('gone', [], 'en')).toMatch(/no turns found/i);
  });

  it('truncates a very long turn', () => {
    const turns = [{ role: 'user', content: 'x'.repeat(500) }];
    const out = renderResumedHistory('s', turns, 'en');
    expect(out).toContain('…');
    expect(out.length).toBeLessThan(300);
  });
});
