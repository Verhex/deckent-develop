// ─── /interrogate slash — REPL pre-plan sorgulama (Sprint 276 T-276-009) ─────
//
// Hermetic: all file I/O uses os.tmpdir() fixtures; no gitignored state read.
// Tests cover: registry registration, question rendering, missing-DIRECTIVES
// honest message, no-provider-round-trip, full loop integration.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  buildSlashRegistry,
} from '../../src/cli/commands/chat-slash-registry.js';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function neverCalledProvider(): ChatProviderAdapter {
  return {
    send: vi.fn(async (): Promise<ProviderResponse> => {
      throw new Error('provider should not be called for a meta-slash command');
    }),
  };
}

function fakeDispatcher(): McpToolDispatcher {
  return {
    dispatch: vi.fn(async () => 'tool-ok'),
  };
}

function baseOpts(
  overrides: Partial<ChatNativeOptions> & {
    provider: ChatProviderAdapter;
    dispatcher: McpToolDispatcher;
    input: AsyncIterable<string>;
  },
): ChatNativeOptions {
  return {
    output: vi.fn(),
    ...overrides,
  };
}

/** Create a temp dir with a DIRECTIVES.md file; return the dir path. */
function withDirectives(content: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'interrogate-test-'));
  fs.writeFileSync(path.join(tmp, 'DIRECTIVES.md'), content, 'utf-8');
  return tmp;
}

const SAMPLE_DIRECTIVES = `# DIRECTIVES — Sprint 1: TEST-001

## Goal: Build the thing.

---

## Task 1: Do the thing
`;

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Registry ─────────────────────────────────────────────────────────────────

describe('chat-slash-registry — /interrogate registration', () => {
  it('registry includes /interrogate', () => {
    const registry = buildSlashRegistry();
    const names = registry.map((c) => c.name);
    expect(names).toContain('/interrogate');
  });

  it('/interrogate has no agenticTool (meta-command)', () => {
    const registry = buildSlashRegistry();
    const entry = registry.find((c) => c.name === '/interrogate');
    expect(entry).toBeDefined();
    expect(entry?.agenticTool).toBeUndefined();
  });

  it('/interrogate has a non-empty desc', () => {
    const registry = buildSlashRegistry();
    const entry = registry.find((c) => c.name === '/interrogate');
    expect(entry?.desc.length).toBeGreaterThan(0);
  });
});

// ─── REPL loop — /interrogate handler ────────────────────────────────────────

describe('runChatNativeLoop — /interrogate renders questions', () => {
  it('shows intro header when DIRECTIVES.md exists', async () => {
    const tmp = withDirectives(SAMPLE_DIRECTIVES);
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: neverCalledProvider(),
      dispatcher: fakeDispatcher(),
      input: lines('/interrogate', '/exit'),
      output,
      projectRoot: tmp,
    }));

    const allOutput = (output.mock.calls as string[][]).map((c) => c[0]).join('\n');
    // The intro i18n key resolves to a sentence containing "Interrogation"
    expect(allOutput).toMatch(/interrogat/i);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('renders 5 numbered questions from DIRECTIVES', async () => {
    const tmp = withDirectives(SAMPLE_DIRECTIVES);
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: neverCalledProvider(),
      dispatcher: fakeDispatcher(),
      input: lines('/interrogate', '/exit'),
      output,
      projectRoot: tmp,
    }));

    const allOutput = (output.mock.calls as string[][]).map((c) => c[0]).join('\n');
    // Should have at least 5 numbered items
    const numbered = allOutput.match(/^\d+\./gm) ?? [];
    expect(numbered.length).toBeGreaterThanOrEqual(5);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('does NOT call provider for /interrogate (pure meta-command)', async () => {
    const tmp = withDirectives(SAMPLE_DIRECTIVES);
    const provider = neverCalledProvider();

    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: fakeDispatcher(),
      input: lines('/interrogate', '/exit'),
      output: vi.fn(),
      projectRoot: tmp,
    }));

    expect(provider.send).not.toHaveBeenCalled();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('shows honest "not found" message when DIRECTIVES.md is missing', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'interrogate-empty-'));
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: neverCalledProvider(),
      dispatcher: fakeDispatcher(),
      input: lines('/interrogate', '/exit'),
      output,
      projectRoot: tmp,
    }));

    const allOutput = (output.mock.calls as string[][]).map((c) => c[0]).join('\n');
    // The chat.directives_not_found message contains "DIRECTIVES" or the root path
    expect(allOutput.length).toBeGreaterThan(0);
    // Must NOT throw or show blank output
    expect(allOutput).not.toEqual('');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('adds /interrogate exchange to transcript', async () => {
    const tmp = withDirectives(SAMPLE_DIRECTIVES);

    const transcript = await runChatNativeLoop(baseOpts({
      provider: neverCalledProvider(),
      dispatcher: fakeDispatcher(),
      input: lines('/interrogate', '/exit'),
      output: vi.fn(),
      projectRoot: tmp,
    }));

    const userTurn = transcript.find((t) => t.role === 'user' && t.content === '/interrogate');
    expect(userTurn).toBeDefined();
    const assistantTurn = transcript.find((t) => t.role === 'assistant' && t.content.length > 0);
    expect(assistantTurn).toBeDefined();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('/interrogate with extra args still works (bare command match)', async () => {
    const tmp = withDirectives(SAMPLE_DIRECTIVES);
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: neverCalledProvider(),
      dispatcher: fakeDispatcher(),
      input: lines('/interrogate --help', '/exit'),
      output,
      projectRoot: tmp,
    }));

    const allOutput = (output.mock.calls as string[][]).map((c) => c[0]).join('\n');
    // Should still render questions, not fall through to provider
    expect(allOutput).toMatch(/interrogat/i);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
