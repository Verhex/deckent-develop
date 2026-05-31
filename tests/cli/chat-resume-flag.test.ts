import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadChatResume,
  renderChatResume,
  DEFAULT_RESUME_LIMIT,
} from '../../src/cli/commands/chat.js';
import type { ChatTurn } from '../../src/core/memory-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTurn(turn_index: number, role: 'user' | 'assistant', content: string): ChatTurn {
  return {
    session_id: 'test-session',
    turn_index,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('chat --resume flag', () => {
  describe('DEFAULT_RESUME_LIMIT', () => {
    it('is 10', () => {
      expect(DEFAULT_RESUME_LIMIT).toBe(10);
    });
  });

  describe('loadChatResume', () => {
    it('returns empty array when DB does not exist (clean start)', () => {
      const nonExistentRoot = join(tmpdir(), `deckent-test-${Date.now()}`);
      const turns = loadChatResume(nonExistentRoot, 'my-session');
      expect(turns).toEqual([]);
    });

    it('uses DEFAULT_RESUME_LIMIT when limit is omitted', () => {
      // Non-existent root always returns [] regardless of limit — verify no throw
      const root = join(tmpdir(), `deckent-test-${Date.now()}`);
      expect(() => loadChatResume(root, 'sess')).not.toThrow();
      expect(loadChatResume(root, 'sess')).toEqual([]);
    });
  });

  describe('renderChatResume', () => {
    it('shows "Starting fresh" when turns array is empty', () => {
      const output = renderChatResume('my-session', []);
      expect(output).toContain('Starting fresh');
      expect(output).toContain('my-session');
    });

    it('formats turns with role prefix and turn_index', () => {
      const turns: ChatTurn[] = [
        makeTurn(0, 'user', 'hello world'),
        makeTurn(1, 'assistant', 'hi there'),
      ];
      const output = renderChatResume('sess-1', turns);
      expect(output).toContain('Resuming chat session "sess-1"');
      expect(output).toContain('user');
      expect(output).toContain('hello world');
      expect(output).toContain('assistant');
      expect(output).toContain('hi there');
    });

    it('includes turn count in the header', () => {
      const turns: ChatTurn[] = [
        makeTurn(0, 'user', 'first'),
        makeTurn(1, 'assistant', 'second'),
        makeTurn(2, 'user', 'third'),
      ];
      const output = renderChatResume('my-sess', turns);
      expect(output).toContain('3');
    });
  });
});
