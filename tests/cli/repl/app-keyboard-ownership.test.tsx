import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplApp, type ConfirmTrigger, type ReplEngine } from '../../../src/cli/repl/app.js';
import { appendLedgerTurn } from '../../../src/cli/repl/session-ledger.js';
import { projectSlug } from '../../../src/core/project-slug.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildReplLabels, buildShortcutsPanel } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import type { PickerSpec } from '../../../src/cli/repl/picker.js';
import type { SprintHistoricalContextSource } from '../../../src/cli/repl/sprint-context-input.js';
import type { ChatProviderAdapter } from '../../../src/cli/commands/chat-native.js';

const tick = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const CTRL_C = '\x03';
const ENTER = '\r';
const t = (key: string): string => getMessage(key, 'en');
const labels = buildReplLabels(t);
const pickerLabels = buildPickerLabels(t);
const roots: string[] = [];
type LoadedSprintFixture = {
  kind: 'loaded'; sprintId: string; manifestDigest: string;
  artifactPath: 'docs/brain-sprint.md'; sha256: string; bytes: number; text: string;
};

const MODEL_SPEC: PickerSpec = {
  kind: 'model',
  initialId: 'model-a',
  scopes: ['session'],
  candidates: [{ id: 'model-a', label: 'model-a', state: 'current', facts: [] }],
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function mountApp(options: { cwd?: string; sessionId?: string; replSurfaceEnabled?: boolean; startupRecentSessions?: boolean; dispatcher?: { dispatch: (name: string, args: Record<string, unknown>) => Promise<string> }; memory?: Record<string, unknown>; engine?: ReplEngine; legacy?: boolean; provider?: ChatProviderAdapter; sprintHistoricalContext?: SprintHistoricalContextSource; ledgerRoot?: string } = {}) {
  const cwd = options.cwd ?? mkdtempSync(join(tmpdir(), 'deckent-l6-keyboard-'));
  if (!options.cwd) roots.push(cwd);
  const ledgerRoot = options.ledgerRoot ?? mkdtempSync(join(tmpdir(), 'deckent-l4c-ledger-root-'));
  if (!options.ledgerRoot) roots.push(ledgerRoot);
  let confirmTrigger: ConfirmTrigger | undefined;
  const engine = options.engine ?? Object.assign(async () => {}, {
    close: vi.fn(),
  }) as unknown as ReplEngine;
  const mounted = render(
    <ReplApp
      provider={options.provider ?? ({} as never)}
      dispatcher={options.dispatcher ?? { dispatch: vi.fn(async () => '') }}
      labels={labels}
      providerName="diagnostic"
      cwd={cwd}
      registerConfirm={(trigger) => { confirmTrigger = trigger; }}
      registerToolSink={() => {}}
      slashRegistry={buildSlashRegistry('en')}
      initialSelection={{ provider: 'diagnostic', model: 'model-a' }}
      onSwitch={() => ({ provider: 'diagnostic', model: 'model-a' })}
      onApprovalMode={() => {}}
      inboxLabels={{} as never}
      pickerLabels={pickerLabels}
      pickerSpecs={{ model: () => MODEL_SPEC }}
      liveFooterLabels={{} as never}
      approvalLabels={{} as never}
      runFlowCardLabels={{} as never}
      runFlowMountLabels={{} as never}
      doSlashLabels={{} as never}
      caretStyle="marker"
      dualStreamOverflow="..."
      shortcutsPanel={buildShortcutsPanel(t)}
      {...(!options.legacy ? { nativeEngine: engine } : {})}
      {...(options.memory ? { memory: options.memory as never } : {})}
      {...(options.sessionId ? { sessionId: options.sessionId } : {})}
      {...(options.replSurfaceEnabled ? { replSurfaceEnabled: true } : {})}
      {...(options.startupRecentSessions ? { startupRecentSessions: true } : {})}
      {...(options.sprintHistoricalContext ? { sprintHistoricalContext: options.sprintHistoricalContext } : {})}
      resumeLedgerOptions={{ rootDir: ledgerRoot }}
    />,
  );
  return { ...mounted, getConfirmTrigger: () => confirmTrigger };
}

async function openPicker(stdin: { write(value: string): void }, lastFrame: () => string | undefined): Promise<void> {
  stdin.write('/approve');
  stdin.write(ENTER);
  await tick(100);
  expect(lastFrame() ?? '').toContain(pickerLabels.title.approve);
}

describe('ReplApp mounted keyboard ownership', () => {
  it('keeps startup recent-session discovery off by default but lets explicit /resume load it', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4-startup-'));
    roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs');
    mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'prior.json'), JSON.stringify({ jobId: 'job-1', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z', summary: 'prior session' }));
    const { stdin, lastFrame, unmount } = mountApp({ cwd, replSurfaceEnabled: true });
    try {
      await tick();
      expect(lastFrame() ?? '').not.toContain('prior session');
      stdin.write('/resume');
      stdin.write(ENTER);
      await tick(100);
      expect(lastFrame() ?? '').toContain('prior session');
    } finally {
      unmount();
    }
  });

  it('shows the startup teaser once when explicitly enabled', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4-startup-on-'));
    roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs');
    mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'prior.json'), JSON.stringify({ jobId: 'job-2', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z', summary: 'startup session' }));
    const { lastFrame, unmount } = mountApp({ cwd, replSurfaceEnabled: true, startupRecentSessions: true });
    await tick(100);
    expect(lastFrame() ?? '').toContain('startup session');
    unmount();
  });

  it('native /status preserves run output and appends the full local chat context', async () => {
    const dispatch = vi.fn(async () => 'run truth: unavailable');
    const { stdin, lastFrame, unmount } = mountApp({ sessionId: 'chat-memory-123', dispatcher: { dispatch } });
    await tick();
    stdin.write('/status');
    stdin.write(ENTER);
    await tick(100);
    expect(dispatch).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(lastFrame() ?? '').toContain('run truth: unavailable');
    expect(lastFrame() ?? '').toContain('local active chat context: chat-memory-123');
    unmount();
  });

  it('commits a typed native resume only after hydration succeeds', async () => {
    const hydrateTranscript = vi.fn();
    const engine = Object.assign(async (_input: string, cbs: { output: (text: string) => void; onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void }) => {
      cbs.output('fresh answer'); cbs.onTurnEnd({ inputTokens: 1, outputTokens: 2 });
    }, { close: vi.fn(), hydrateTranscript }) as unknown as ReplEngine;
    const appendChatTurn = vi.fn();
    const memory = {
      listChatSessions: () => [{ sessionId: 'chat-target', lastAt: '2026-09-07T00:00:00.000Z', preview: 'target' }],
      getChatHistory: () => [{ role: 'user', content: 'prior context' }],
      appendChatTurn,
    };
    const { stdin, lastFrame, unmount } = mountApp({ sessionId: 'chat-old', memory, engine, replSurfaceEnabled: true });
    try {
      await tick(); stdin.write('/resume chat-target'); stdin.write(ENTER); await tick(100);
      expect(hydrateTranscript).toHaveBeenCalled();
      expect(lastFrame() ?? '').toContain('resumed: chat-target');
      expect(lastFrame() ?? '').toContain('chat: chat-target');
      stdin.write('next turn'); stdin.write(ENTER); await tick(100);
      expect(appendChatTurn).toHaveBeenCalledWith('chat-target', 'user', 'next turn');
      expect(appendChatTurn).toHaveBeenCalledWith('chat-target', 'assistant', 'fresh answer');
    } finally { unmount(); }
  });

  it.each([
    ['missing', () => []],
    ['read failure', () => { throw new Error('fixture read failure'); }],
  ])('preserves the prior identity when native resume is %s', async (_name, getChatHistory) => {
    const engine = Object.assign(async () => {}, { close: vi.fn(), hydrateTranscript: vi.fn() }) as unknown as ReplEngine;
    const memory = { listChatSessions: () => [{ sessionId: 'chat-target', lastAt: '2026-09-07T00:00:00.000Z', preview: 'target' }], getChatHistory };
    const { stdin, lastFrame, unmount } = mountApp({ sessionId: 'chat-old', memory, engine, replSurfaceEnabled: true });
    try {
      await tick(); stdin.write('/resume chat-target'); stdin.write(ENTER); await tick(100);
      expect(lastFrame() ?? '').toContain('chat: chat-old');
      expect(lastFrame() ?? '').not.toContain('chat: chat-target');
    } finally { unmount(); }
  });

  it('refuses a sprint projection without changing local chat identity', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4b-sprint-')); roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs'); mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'prior.json'), JSON.stringify({ sprintId: 'sprint-7098', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z' }));
    const { stdin, lastFrame, unmount } = mountApp({ cwd, sessionId: 'chat-old', replSurfaceEnabled: true });
    try {
      await tick(); stdin.write('/resume sprint-7098'); stdin.write(ENTER); await tick(100);
      expect(lastFrame() ?? '').toContain(getMessage('tui.resume_sprint_context_unavailable_with_reason', 'en', {
        id: 'sprint-7098',
        reason: 'SPRINT_CONTEXT_DISABLED',
      }));
      expect(lastFrame() ?? '').toContain('chat: chat-old');
    } finally { unmount(); }
  });

  it('never admits a recent sprint disk row to archive fallback when its exact ledger is malformed', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4c-recent-malformed-')); roots.push(cwd);
    const ledgerRoot = mkdtempSync(join(tmpdir(), 'deckent-l4c-ledger-')); roots.push(ledgerRoot);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs'); mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'recent.json'), JSON.stringify({ sprintId: 'sprint-7099', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z' }));
    appendLedgerTurn({
      rootDir: ledgerRoot, cwd, sessionId: 'sprint-7099', turnIndex: 0,
      ts: '2026-09-07T00:00:00.000Z', provider: 'fixture', model: 'fixture', messagesDelta: [], usage: null,
    });
    const ledgerFile = join(ledgerRoot, 'projects', projectSlug(cwd), 'sprint-7099.jsonl');
    appendFileSync(ledgerFile, '{malformed}\n');
    const load = vi.fn(async () => ({
      kind: 'loaded' as const, sprintId: 'sprint-7099', manifestDigest: 'a'.repeat(64),
      artifactPath: 'docs/brain-sprint.md' as const, sha256: 'b'.repeat(64), bytes: 4, text: 'must not load',
    }));
    const { stdin, lastFrame, unmount } = mountApp({
      cwd, sessionId: 'chat-old', replSurfaceEnabled: true, ledgerRoot,
      sprintHistoricalContext: { availability: 'enabled', load },
    });
    try {
      await tick(); stdin.write('/resume sprint-7099'); stdin.write(ENTER); await tick(100);
      expect(load).not.toHaveBeenCalled();
      expect(lastFrame() ?? '').toContain(getMessage('tui.resume_picker_failed', 'en', { id: 'sprint-7099' }));
      expect(lastFrame() ?? '').toContain('chat: chat-old');
    } finally { unmount(); }
  });

  it('hydrates an exact native sprint-id ledger beyond the recent-five list instead of loading archive context', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4c-native-literal-')); roots.push(cwd);
    const ledgerRoot = mkdtempSync(join(tmpdir(), 'deckent-l4c-ledger-')); roots.push(ledgerRoot);
    for (const [index, sessionId] of ['sprint-7099', 'new-1', 'new-2', 'new-3', 'new-4', 'new-5'].entries()) {
      appendLedgerTurn({
        rootDir: ledgerRoot, cwd, sessionId, turnIndex: 0,
        ts: `2026-09-07T00:0${index}:00.000Z`, provider: 'fixture', model: 'fixture',
        messagesDelta: [{ role: 'user', content: sessionId === 'sprint-7099' ? 'older literal ledger' : sessionId }], usage: null,
      });
    }
    const hydrateTranscript = vi.fn();
    const engine = Object.assign(async () => {}, { close: vi.fn(), hydrateTranscript }) as unknown as ReplEngine;
    const load = vi.fn();
    const { stdin, lastFrame, unmount } = mountApp({
      cwd, sessionId: 'chat-old', engine, replSurfaceEnabled: true, ledgerRoot,
      sprintHistoricalContext: { availability: 'enabled', load },
    });
    try {
      await tick(); stdin.write('/resume sprint-7099'); stdin.write(ENTER); await tick(100);
      expect(hydrateTranscript).toHaveBeenCalledWith(
        [expect.objectContaining({ role: 'user', content: 'older literal ledger' })], { nextTurnIndex: 1 },
      );
      expect(load).not.toHaveBeenCalled();
      expect(lastFrame() ?? '').toContain('chat: sprint-7099');
    } finally { unmount(); }
  });

  it('loads exact sprint context without switching chat identity and injects it only into the next submitted request', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4b2-sprint-')); roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs'); mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'prior.json'), JSON.stringify({ sprintId: 'sprint-7099', jobId: 'job-not-an-id', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z' }));
    const requests: string[] = [];
    const engine = Object.assign(async (input: string, cbs: { onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void }) => {
      requests.push(input); cbs.onTurnEnd({ inputTokens: 1, outputTokens: 1 });
    }, { close: vi.fn() }) as unknown as ReplEngine;
    const load = vi.fn(async () => ({
      kind: 'loaded' as const, sprintId: 'sprint-7099', manifestDigest: 'a'.repeat(64),
      artifactPath: 'docs/brain-sprint.md' as const, sha256: 'b'.repeat(64), bytes: 15, text: 'sealed history',
    }));
    const { stdin, lastFrame, unmount } = mountApp({
      cwd, sessionId: 'chat-old', replSurfaceEnabled: true, engine,
      sprintHistoricalContext: { availability: 'enabled', load },
    });
    try {
      await tick(); stdin.write('/resume sprint-7099'); stdin.write(ENTER); await tick(100);
      expect(load).toHaveBeenCalledWith('sprint-7099', expect.any(AbortSignal));
      expect(lastFrame() ?? '').toContain('chat: chat-old');
      stdin.write('first request'); stdin.write(ENTER); await tick(100);
      stdin.write('second request'); stdin.write(ENTER); await tick(100);
      expect(requests).toHaveLength(2);
      expect(requests[0]).toContain('first request');
      expect(requests[0]).toContain('sealed history');
      expect(requests[0]).toContain('sprint-id=sprint-7099');
      expect(requests[1]).toBe('second request');
    } finally { unmount(); }
  });

  it('uses the same one-shot annotated request on the legacy provider path', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4b2-legacy-')); roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs'); mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'prior.json'), JSON.stringify({ sprintId: 'sprint-7099', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z' }));
    const providerRequests: string[][] = [];
    const provider: ChatProviderAdapter = {
      send: vi.fn(async (messages) => {
        providerRequests.push(messages.filter((message) => message.role === 'user').map((message) => message.content));
        return { text: 'legacy reply', stopReason: 'end_turn' };
      }),
    };
    const load = vi.fn(async () => ({
      kind: 'loaded' as const, sprintId: 'sprint-7099', manifestDigest: 'a'.repeat(64),
      artifactPath: 'docs/brain-sprint.md' as const, sha256: 'b'.repeat(64), bytes: 14, text: 'legacy context',
    }));
    const { stdin, unmount } = mountApp({
      cwd, legacy: true, provider, replSurfaceEnabled: true,
      sprintHistoricalContext: { availability: 'enabled', load },
    });
    try {
      await tick(); stdin.write('/resume sprint-7099'); stdin.write(ENTER); await tick(100);
      stdin.write('legacy first'); stdin.write(ENTER); await tick(100);
      stdin.write('legacy second'); stdin.write(ENTER); await tick(100);
      expect(providerRequests).toHaveLength(2);
      expect(providerRequests[0]?.at(-1)).toContain('legacy first');
      expect(providerRequests[0]?.at(-1)).toContain('legacy context');
      expect(providerRequests[1]?.at(-1)).toBe('legacy second');
      // The prior annotated request remains normal conversation history; only
      // the newly submitted second message must be free of reinjection.
      expect(providerRequests[1]?.[0]).toContain('legacy context');
    } finally { unmount(); }
  });

  it('does not arm a late sprint load after /clear changes the generation', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4b2-clear-')); roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs'); mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'prior.json'), JSON.stringify({ sprintId: 'sprint-7099', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z' }));
    let resolveLoad!: (value: { kind: 'loaded'; sprintId: string; manifestDigest: string; artifactPath: 'docs/brain-sprint.md'; sha256: string; bytes: number; text: string }) => void;
    const load = vi.fn(() => new Promise<Parameters<typeof resolveLoad>[0]>((resolve) => { resolveLoad = resolve; }));
    const requests: string[] = [];
    const engine = Object.assign(async (input: string, cbs: { onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void }) => {
      requests.push(input); cbs.onTurnEnd({ inputTokens: 1, outputTokens: 1 });
    }, { close: vi.fn() }) as unknown as ReplEngine;
    const { stdin, unmount } = mountApp({ cwd, engine, replSurfaceEnabled: true, sprintHistoricalContext: { availability: 'enabled', load } });
    try {
      await tick(); stdin.write('/resume sprint-7099'); stdin.write(ENTER); await tick();
      stdin.write('/clear'); stdin.write(ENTER); await tick();
      resolveLoad({ kind: 'loaded', sprintId: 'sprint-7099', manifestDigest: 'a'.repeat(64), artifactPath: 'docs/brain-sprint.md', sha256: 'b'.repeat(64), bytes: 4, text: 'late' });
      await tick(); stdin.write('fresh'); stdin.write(ENTER); await tick(100);
      expect(requests.at(-1)).toBe('fresh');
    } finally { unmount(); }
  });

  it('binds concurrent loads to the newest generation and never carries the older sprint across it', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4b2-newest-')); roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs'); mkdirSync(jobs, { recursive: true });
    for (const sprintId of ['sprint-7098', 'sprint-7099']) {
      writeFileSync(join(jobs, `${sprintId}.json`), JSON.stringify({ sprintId, status: 'completed', startedAt: sprintId === 'sprint-7099' ? '2026-09-07T01:00:00.000Z' : '2026-09-07T00:00:00.000Z' }));
    }
    const resolvers = new Map<string, (value: LoadedSprintFixture) => void>();
    const load = vi.fn((sprintId: string) => new Promise<LoadedSprintFixture>((resolve) => { resolvers.set(sprintId, resolve); }));
    const requests: string[] = [];
    const engine = Object.assign(async (input: string, cbs: { onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void }) => {
      requests.push(input); cbs.onTurnEnd({ inputTokens: 1, outputTokens: 1 });
    }, { close: vi.fn() }) as unknown as ReplEngine;
    const { stdin, unmount } = mountApp({ cwd, engine, replSurfaceEnabled: true, sprintHistoricalContext: { availability: 'enabled', load } });
    const loaded = (sprintId: string) => ({ kind: 'loaded' as const, sprintId, manifestDigest: 'a'.repeat(64), artifactPath: 'docs/brain-sprint.md' as const, sha256: 'b'.repeat(64), bytes: 3, text: sprintId });
    try {
      await tick(); stdin.write('/resume sprint-7098'); stdin.write(ENTER); await tick();
      stdin.write('/resume sprint-7099'); stdin.write(ENTER); await tick();
      resolvers.get('sprint-7098')?.(loaded('sprint-7098'));
      resolvers.get('sprint-7099')?.(loaded('sprint-7099'));
      await tick(); stdin.write('continue'); stdin.write(ENTER); await tick(100);
      expect(requests.at(-1)).toContain('sprint-id=sprint-7099');
      expect(requests.at(-1)).not.toContain('sprint-id=sprint-7098');
    } finally { unmount(); }
  });

  it('aborts a pending sprint load when a chat resume commits a new identity', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4b2-switch-')); roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs'); mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'sprint.json'), JSON.stringify({ sprintId: 'sprint-7099', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z' }));
    let resolveLoad!: (value: LoadedSprintFixture) => void;
    let observedSignal: AbortSignal | undefined;
    const load = vi.fn((_sprintId: string, signal: AbortSignal) => {
      observedSignal = signal;
      return new Promise<LoadedSprintFixture>((resolve) => { resolveLoad = resolve; });
    });
    const requests: string[] = [];
    const engine = Object.assign(async (input: string, cbs: { onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void }) => {
      requests.push(input); cbs.onTurnEnd({ inputTokens: 1, outputTokens: 1 });
    }, { close: vi.fn(), hydrateTranscript: vi.fn() }) as unknown as ReplEngine;
    const memory = {
      listChatSessions: () => [{ sessionId: 'chat-target', lastAt: '2026-09-07T01:00:00.000Z', preview: 'target' }],
      getChatHistory: (id: string) => id === 'chat-target' ? [{ role: 'user', content: 'prior' }] : [],
    };
    const { stdin, lastFrame, unmount } = mountApp({ cwd, sessionId: 'chat-old', memory, engine, replSurfaceEnabled: true, sprintHistoricalContext: { availability: 'enabled', load } });
    try {
      await tick(); stdin.write('/resume sprint-7099'); stdin.write(ENTER); await tick();
      stdin.write('/resume chat-target'); stdin.write(ENTER); await tick();
      expect(observedSignal?.aborted).toBe(true);
      resolveLoad({ kind: 'loaded', sprintId: 'sprint-7099', manifestDigest: 'a'.repeat(64), artifactPath: 'docs/brain-sprint.md', sha256: 'b'.repeat(64), bytes: 4, text: 'late' });
      await tick(); stdin.write('fresh'); stdin.write(ENTER); await tick(100);
      expect(lastFrame() ?? '').toContain('chat: chat-target');
      expect(requests.at(-1)).toBe('fresh');
    } finally { unmount(); }
  });

  it('preserves an already loaded pending context when a later archive load holds', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4b2-hold-')); roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs'); mkdirSync(jobs, { recursive: true });
    for (const sprintId of ['sprint-7098', 'sprint-7099']) {
      writeFileSync(join(jobs, `${sprintId}.json`), JSON.stringify({ sprintId, status: 'completed', startedAt: `${sprintId.endsWith('9') ? '2026-09-07T01' : '2026-09-07T00'}:00:00.000Z` }));
    }
    const load = vi.fn(async (sprintId: string) => sprintId === 'sprint-7098'
      ? { kind: 'loaded' as const, sprintId, manifestDigest: 'a'.repeat(64), artifactPath: 'docs/brain-sprint.md' as const, sha256: 'b'.repeat(64), bytes: 5, text: 'prior' }
      : { kind: 'hold' as const, reasonCode: 'ARCHIVE_VERIFICATION_FAILED' });
    const requests: string[] = [];
    const engine = Object.assign(async (input: string, cbs: { onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void }) => {
      requests.push(input); cbs.onTurnEnd({ inputTokens: 1, outputTokens: 1 });
    }, { close: vi.fn() }) as unknown as ReplEngine;
    const { stdin, unmount } = mountApp({ cwd, engine, replSurfaceEnabled: true, sprintHistoricalContext: { availability: 'enabled', load } });
    try {
      await tick(); stdin.write('/resume sprint-7098'); stdin.write(ENTER); await tick();
      stdin.write('/resume sprint-7099'); stdin.write(ENTER); await tick();
      stdin.write('continue'); stdin.write(ENTER); await tick(100);
      expect(requests.at(-1)).toContain('sprint-id=sprint-7098');
      expect(requests.at(-1)).not.toContain('sprint-id=sprint-7099');
    } finally { unmount(); }
  });

  it('picker consumes Ctrl-C exactly once, then idle Ctrl-C follows the normal arm policy', async () => {
    const { stdin, lastFrame, unmount } = mountApp();
    await tick();
    await openPicker(stdin, lastFrame);

    stdin.write(CTRL_C);
    await tick(100);
    expect(lastFrame() ?? '').not.toContain(pickerLabels.title.approve);
    expect(lastFrame() ?? '').not.toContain(labels.ctrlCArm);

    // If the old global gate also consumed the picker key, this is the second
    // Ctrl-C and exits. With one owner it is the first idle press and arms.
    stdin.write(CTRL_C);
    await tick(80);
    expect(lastFrame() ?? '').toContain(labels.ctrlCArm);

    // The app remains mounted and can open the real picker again.
    await openPicker(stdin, lastFrame);
    unmount();
  });

  it('an inactive picker does not suppress fallback Ctrl-C owned above it', async () => {
    const { stdin, lastFrame, getConfirmTrigger, unmount } = mountApp();
    await tick();
    await openPicker(stdin, lastFrame);
    const trigger = getConfirmTrigger();
    expect(trigger).toBeTypeOf('function');
    const pending = trigger!('higher-priority confirmation');
    await tick(80);
    expect(lastFrame() ?? '').toContain('higher-priority confirmation');

    stdin.write(CTRL_C);
    await tick(80);
    expect(lastFrame() ?? '').toContain(labels.ctrlCArm);
    expect(lastFrame() ?? '').toContain(pickerLabels.title.approve);

    stdin.write('n');
    await expect(pending).resolves.toBe('n');
    unmount();
  });
});
