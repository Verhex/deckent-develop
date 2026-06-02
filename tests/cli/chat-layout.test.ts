import { describe, it, expect } from 'vitest';
import {
  renderUserMessage,
  renderAssistantHeader,
  messageSeparator,
} from '../../src/cli/commands/chat-layout.js';

describe('chat-layout — renderUserMessage', () => {
  it('plain `› ` prefix on non-TTY', () => {
    expect(renderUserMessage('selam', false)).toBe('› selam');
  });
  it('colour-wrapped prefix on TTY, line still present', () => {
    const out = renderUserMessage('selam', true);
    expect(out).toContain('\x1b['); // ANSI present
    expect(out).toContain('selam');
  });
});

describe('chat-layout — renderAssistantHeader', () => {
  it('plain `● deckent` on non-TTY', () => {
    expect(renderAssistantHeader(false)).toBe('● deckent');
  });
  it('colour-wrapped + bold on TTY', () => {
    const out = renderAssistantHeader(true);
    expect(out).toContain('\x1b[');
    expect(out).toContain('deckent');
  });
});

describe('chat-layout — messageSeparator', () => {
  it('returns empty string on non-TTY (dropped by caller)', () => {
    expect(messageSeparator(false)).toBe('');
  });
  it('returns a decorated rule on TTY', () => {
    const out = messageSeparator(true);
    expect(out).toContain('─');
    expect(out).toContain('\x1b[');
  });
});
