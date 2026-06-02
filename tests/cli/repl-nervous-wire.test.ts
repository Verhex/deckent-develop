// tests/cli/repl-nervous-wire.test.ts
//
// Sprint 224 Task 224-002 — `/nervous` slash wire (chat-nervous-bridge → chat-native caller).
// Hermetic: all file I/O happens in tmpdir, no reads from project .deckent/.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runChatNativeLoop,
  type ChatProviderAdapter,
  type ChatNativeOptions,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import type { NervousNotification } from '../../src/core/nervous-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function* feed(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'repl-nervous-wire-'));
}

function writePending(root: string, items: NervousNotification[]): void {
  const dir = join(root, '.deckent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'nervous-pending.json'),
    JSON.stringify(items, null, 2) + '\n',
    'utf-8',
  );
}

function readPending(root: string): NervousNotification[] {
  const path = join(root, '.deckent', 'nervous-pending.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf-8')) as NervousNotification[];
}

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    type: 'test-type',
    title: 'Sample',
    message: 'A sample notification',
    severity: 'warning',
    createdAt: '2026-06-02T00:00:00.000Z',
    detectorId: 'sample-detector',
    actions: [
      { id: 'SAMPLE_ACTION', policy: 'suggest-5m' } as unknown as NervousNotification['actions'][number],
    ],
    timeoutMs: 300000,
    ...overrides,
  };
}

function nullProvider(): ChatProviderAdapter {
  // Provider should never be called when /nervous is intercepted.
  return {
    send: vi.fn(async (): Promise<ProviderResponse> => ({
      text: 'should-not-be-called',
      stopReason: 'end_turn',
    })),
  };
}

function nullDispatcher(): McpToolDispatcher {
  return { dispatch: vi.fn(async () => 'no-op') };
}

function baseOpts(
  overrides: Partial<ChatNativeOptions> & {
    input: AsyncIterable<string>;
    output: (line: string) => void;
    nervousRoot: string;
  },
): ChatNativeOptions {
  return {
    provider: nullProvider(),
    dispatcher: nullDispatcher(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('/nervous slash wire — chat-native', () => {
  let root: string;
  const lines: string[] = [];
  const sink = (s: string): void => {
    lines.push(s);
  };

  beforeEach(() => {
    root = makeTmpRoot();
    lines.length = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('/nervous lists pending notifications (non-TTY)', async () => {
    const n1 = makeNotification({
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      detectorId: 'detector-a',
    });
    const n2 = makeNotification({
      id: 'bbbbbbbb-0000-0000-0000-000000000002',
      detectorId: 'detector-b',
      severity: 'critical',
    });
    writePending(root, [n1, n2]);

    await runChatNativeLoop(baseOpts({
      input: feed('/nervous', '/exit'),
      output: sink,
      nervousRoot: root,
    }));

    const out = lines.join('\n');
    expect(out).toContain('detector-a');
    expect(out).toContain('detector-b');
    // It should NOT route to "Unknown command" or a provider — the provider stub never runs.
    expect(out).not.toContain('should-not-be-called');
  });

  it('/nervous renders the visible banner on TTY (ansi + ⚡) when pending exists', async () => {
    const n = makeNotification({ detectorId: 'visible-detector' });
    writePending(root, [n]);

    await runChatNativeLoop(baseOpts({
      input: feed('/nervous', '/exit'),
      output: sink,
      nervousRoot: root,
      interactiveTty: true,
    }));

    const out = lines.join('\n');
    expect(out).toContain('⚡');
    expect(out).toContain('nervous');
    expect(out).toContain('visible-detector');
    expect(out).toContain('\x1b[');
  });

  it('/nervous accept <id> removes the notification from pending', async () => {
    const n = makeNotification({
      id: 'aaaaaaaa-1111-1111-1111-111111111111',
      detectorId: 'accept-detector',
    });
    writePending(root, [n]);

    await runChatNativeLoop(baseOpts({
      input: feed('/nervous accept aaaaaaaa', '/exit'),
      output: sink,
      nervousRoot: root,
    }));

    const remaining = readPending(root);
    expect(remaining).toHaveLength(0);
    const out = lines.join('\n');
    expect(out.toLowerCase()).toContain('accept');
  });

  it('/nervous reject <id> removes the notification from pending', async () => {
    const n = makeNotification({
      id: 'cccccccc-2222-2222-2222-222222222222',
      detectorId: 'reject-detector',
    });
    writePending(root, [n]);

    await runChatNativeLoop(baseOpts({
      input: feed('/nervous reject cccccccc', '/exit'),
      output: sink,
      nervousRoot: root,
    }));

    const remaining = readPending(root);
    expect(remaining).toHaveLength(0);
    const out = lines.join('\n');
    expect(out.toLowerCase()).toContain('reject');
  });

  it('/nervous with no pending emits "bekleyen yok" — no "Unknown command"', async () => {
    await runChatNativeLoop(baseOpts({
      input: feed('/nervous', '/exit'),
      output: sink,
      nervousRoot: root,
    }));

    const out = lines.join('\n');
    expect(out).toContain('bekleyen');
    expect(out.toLowerCase()).not.toContain('unknown command');
  });
});
