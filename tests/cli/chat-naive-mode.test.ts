import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Hoisted Spies (referenced inside vi.mock factories) ────────────

const hoisted = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: hoisted.spawnMock,
}));

vi.mock('../../src/providers/claude.js', () => ({
  ClaudeAdapter: class {
    constructor(_root: string) {}
    detect = vi.fn();
  },
}));

vi.mock('../../src/providers/codex.js', () => ({
  CodexAdapter: class {
    constructor(_root: string) {}
    detect = vi.fn();
  },
}));

vi.mock('../../src/providers/gemini.js', () => ({
  GeminiAdapter: class {
    constructor(_root: string) {}
    detect = vi.fn();
  },
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

// ─── Static Imports (after mocks) ────────────────────────────────────

import {
  buildNaiveSystemPrompt,
  classifyChatIntent,
  spawnChatProcess,
  type ChatTool,
} from '../../src/cli/commands/chat.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function fakeChildProcess(): EventEmitter & { kill: ReturnType<typeof vi.fn>; killed: boolean } {
  const emitter = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };
  emitter.kill = vi.fn();
  emitter.killed = false;
  return emitter;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('buildNaiveSystemPrompt', () => {
  it('pins the Trinity AI-Asistan persona phrase', () => {
    const prompt = buildNaiveSystemPrompt();
    expect(prompt).toMatch(/Deckent's conversational assistant/);
    expect(prompt).toMatch(/Trinity AI-Asistan persona/);
  });

  it('documents the casual / naïve rule with no-MCP guidance', () => {
    const prompt = buildNaiveSystemPrompt();
    expect(prompt).toMatch(/CASUAL/);
    expect(prompt).toMatch(/merhaba/);
    expect(prompt).toMatch(/DO NOT call any MCP tool/);
  });

  it('documents the task rule with concrete tool mappings', () => {
    const prompt = buildNaiveSystemPrompt();
    expect(prompt).toMatch(/TASK/);
    expect(prompt).toMatch(/deckent_start/);
    expect(prompt).toMatch(/deckent_status/);
    expect(prompt).toMatch(/deckent_memory_query/);
    expect(prompt).toMatch(/deckent_run/);
  });

  it('documents the ambiguous rule with clarification step', () => {
    const prompt = buildNaiveSystemPrompt();
    expect(prompt).toMatch(/AMBIGUOUS/);
    expect(prompt).toMatch(/clarifying question/);
  });

  it('forbids fabricated tools / tool results', () => {
    const prompt = buildNaiveSystemPrompt();
    expect(prompt).toMatch(/Never fabricate tool results/);
    expect(prompt).toMatch(/do not invent tools/);
  });
});

describe('classifyChatIntent', () => {
  it('returns "casual" for greetings in TR and EN', () => {
    expect(classifyChatIntent('merhaba')).toBe('casual');
    expect(classifyChatIntent('Hi there!')).toBe('casual');
    expect(classifyChatIntent('hello, what can you do?')).toBe('casual');
  });

  it('returns "task" for actionable verbs', () => {
    expect(classifyChatIntent('start a sprint to add rate limiting')).toBe('task');
    expect(classifyChatIntent('Check sprint status please')).toBe('task');
    expect(classifyChatIntent('fix this bug in the API')).toBe('task');
    expect(classifyChatIntent('query memory for ollama notes')).toBe('task');
  });

  it('returns "task" for autonomous + nervous automation intents (TR + EN)', () => {
    expect(classifyChatIntent('enable autonomous')).toBe('task');
    expect(classifyChatIntent('show autonomous status')).toBe('task');
    expect(classifyChatIntent('show pending approvals')).toBe('task');
    expect(classifyChatIntent('nervous status')).toBe('task');
    expect(classifyChatIntent('otonom durumu göster')).toBe('task');
    expect(classifyChatIntent('bekleyen onayları göster')).toBe('task');
  });

  it('returns "ambiguous" when no rule matches', () => {
    expect(classifyChatIntent('hmm what about that thing')).toBe('ambiguous');
    expect(classifyChatIntent('   ')).toBe('ambiguous');
    expect(classifyChatIntent('')).toBe('ambiguous');
  });

  it('prefers "task" over "casual" when both markers are present', () => {
    // tie-break documented in the helper docstring — actionable verb wins
    expect(classifyChatIntent('hi, please start a sprint')).toBe('task');
  });
});

describe('spawnChatProcess — naïve prompt wiring', () => {
  beforeEach(() => {
    hoisted.spawnMock.mockReset();
  });

  it('omits the system prompt when naïve mode is off (default — preserves legacy spawn shape)', () => {
    hoisted.spawnMock.mockImplementation(() => fakeChildProcess());

    const { detach } = spawnChatProcess('claude');
    detach();

    const [, args, opts] = hoisted.spawnMock.mock.calls[0];
    expect(args).toEqual([]);
    expect(opts.env.DECKENT_CHAT_SYSTEM_PROMPT).toBeUndefined();
    expect(opts.env.DECKENT_MCP_AUTO_ATTACH).toBe('1');
  });

  it('injects DECKENT_CHAT_SYSTEM_PROMPT env var for every host when naïve mode is on', () => {
    const tools: ChatTool[] = ['claude', 'codex', 'gemini'];
    for (const tool of tools) {
      hoisted.spawnMock.mockReset();
      hoisted.spawnMock.mockImplementation(() => fakeChildProcess());

      const { detach } = spawnChatProcess(tool, { naiveMode: true });
      detach();

      const [, , opts] = hoisted.spawnMock.mock.calls[0];
      expect(opts.env.DECKENT_CHAT_SYSTEM_PROMPT).toContain('Trinity AI-Asistan persona');
      expect(opts.env.DECKENT_MCP_AUTO_ATTACH).toBe('1');
    }
  });

  it('passes --append-system-prompt to claude with the prompt body', () => {
    hoisted.spawnMock.mockImplementation(() => fakeChildProcess());

    const { detach } = spawnChatProcess('claude', { naiveMode: true });
    detach();

    const [bin, args] = hoisted.spawnMock.mock.calls[0];
    expect(bin).toBe('claude');
    expect(args[0]).toBe('--append-system-prompt');
    expect(args[1]).toContain('CASUAL');
    expect(args[1]).toContain('TASK');
    expect(args[1]).toContain('AMBIGUOUS');
  });

  it('does NOT pass --append-system-prompt to codex or gemini (env var only)', () => {
    for (const tool of ['codex', 'gemini'] as const) {
      hoisted.spawnMock.mockReset();
      hoisted.spawnMock.mockImplementation(() => fakeChildProcess());

      const { detach } = spawnChatProcess(tool, { naiveMode: true });
      detach();

      const [, args] = hoisted.spawnMock.mock.calls[0];
      expect(args).toEqual([]);
    }
  });
});
