// ═══ Task 358-006 — APP-SURFACE-WIRE — pure-logic tests ═════════════════════
//
// Wires session-resume.ts (startup teaser + /resume picker) and busy-controls.ts
// (/queue /interrupt /steer + Esc→interrupt) into the Ink REPL App
// (src/cli/repl/app.tsx), gated behind the existing `replSurfaceEnabled` seam.
//
// Why no Ink mount despite the `.tsx` extension: ink-testing-library is NOT a
// project dependency (same finding as tests/cli/repl-surface-wire.test.tsx and
// tests/cli/app-approval-wire.test.tsx), so this suite exercises the pure,
// JSX-free decision logic app.tsx exports for exactly this reason —
// buildResumePickerLines / resolveResumeCommand / renderBusyDecision /
// steerNotesToInputs / chatSessionsToRecords — the same "pull pure logic out
// of the component" pattern as resolveModeLabel (354-001) and
// resolveFooterLines (355-011). A helper returning [] / 'passthrough' is
// exactly the condition the component branches on before rendering anything,
// so it stands in for "would (not) render" without mounting Ink.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RESUME_RECENT_LIMIT,
  buildResumePickerLines,
  chatSessionsToRecords,
  hydrateNativeResume,
  mergeResumeSessionRecords,
  resolveResumeCommand,
  renderBusyDecision,
  steerNotesToInputs,
  type ReplLabels,
} from '../../../src/cli/repl/app.js';
import { appendLedgerTurn } from '../../../src/cli/repl/session-ledger.js';
import { listRecentSessions, type SessionRecord } from '../../../src/cli/helpers/session-resume.js';
import {
  initialBusyControlsState,
  markBusy,
  markIdle,
  parseBusyCommand,
  resolveQueueCommand,
  applyInterrupt,
  applySteer,
  resolveKeyAction,
  type BusyControlsState,
} from '../../../src/cli/repl/busy-controls.js';
import { createChatTurnQueue } from '../../../src/cli/repl/chat-turn-queue.js';
import { JOBS_DIR } from '../../../src/core/constants.js';

const NO_LABELS: Pick<ReplLabels, never> = {};

const record = (id: string, overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  title: `title of ${id}`,
  date: '2026-07-01T10:00:00.000Z',
  status: 'completed',
  ...overrides,
});

// ─── Startup teaser — disk fixtures (hermetic tmpdir) ────────────────────────

describe('startup teaser — listRecentSessions → buildResumePickerLines (fixtures)', () => {
  const roots: string[] = [];
  const makeRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'app-surface-wire-'));
    roots.push(root);
    return root;
  };
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('renders the teaser when the jobs source has sessions (fixture 1)', () => {
    const root = makeRoot();
    mkdirSync(join(root, JOBS_DIR), { recursive: true });
    writeFileSync(join(root, JOBS_DIR, 'job-a.json'), JSON.stringify({
      jobId: 'job-a', sprintId: 'sprint-357', status: 'completed',
      startedAt: '2026-07-01T09:00:00.000Z', completedAt: '2026-07-01T10:00:00.000Z',
      summary: 'TOOL-katalog sprinti',
    }));
    writeFileSync(join(root, JOBS_DIR, 'job-b.json'), JSON.stringify({
      jobId: 'job-b', sprintId: 'sprint-358', status: 'running',
      startedAt: '2026-07-02T08:00:00.000Z',
    }));

    const sessions = listRecentSessions(root, RESUME_RECENT_LIMIT);
    expect(sessions).toHaveLength(2);

    const lines = buildResumePickerLines(sessions, [], NO_LABELS);
    // header + one row per session + hint — the App renders this as ONE turn.
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Recent sessions');
    expect(lines[1]).toContain('1. sprint-358');       // newest first
    expect(lines[1]).toContain('2026-07-02 08:00');    // compact time
    expect(lines[2]).toContain('2. TOOL-katalog sprinti');
    expect(lines[3]).toContain('/resume');
  });

  it('renders NOTHING when the source is empty (fixture 2 — degrade-safe)', () => {
    const root = makeRoot(); // no .deckent/runtime/jobs at all — fresh checkout
    const sessions = listRecentSessions(root, RESUME_RECENT_LIMIT);
    expect(sessions).toEqual([]);
    // [] is exactly the App's "do not render the teaser at all" condition.
    expect(buildResumePickerLines(sessions, [], NO_LABELS)).toEqual([]);
  });
});

// ─── buildResumePickerLines / chatSessionsToRecords — merge shape ────────────

describe('buildResumePickerLines — disk+chat merge, continuous numbering', () => {
  it('numbers disk rows first, then chat rows, one shared number-space', () => {
    const disk = [record('sprint-357'), record('sprint-356')];
    const chat = chatSessionsToRecords([
      { sessionId: 'chat-123', lastAt: '2026-06-30T12:00:00.000Z', preview: 'fix the parser' },
    ]);
    const lines = buildResumePickerLines(disk, chat, NO_LABELS);
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain('1. title of sprint-357');
    expect(lines[2]).toContain('2. title of sprint-356');
    expect(lines[3]).toContain('3. fix the parser');
    expect(lines[3]).toContain('· chat ·');
  });

  it('uses caller-supplied labels when present (i18n-first seam)', () => {
    const lines = buildResumePickerLines([record('s')], [], {
      resumeHeader: 'Son oturumlar',
      resumeHint: 'İpucu: /resume <numara>',
    });
    expect(lines[0]).toBe('Son oturumlar');
    expect(lines[2]).toBe('İpucu: /resume <numara>');
  });
});

describe('chatSessionsToRecords — ChatSessionSummary → SessionRecord mapping', () => {
  it('maps id/preview/lastAt and marks the rows as chat sessions', () => {
    const records = chatSessionsToRecords([
      { sessionId: 'chat-1', lastAt: '2026-06-29T09:30:00.000Z', preview: 'hello world' },
      { sessionId: 'chat-2', lastAt: '2026-06-28T09:30:00.000Z', preview: '' },
    ]);
    expect(records[0]).toEqual({ id: 'chat-1', title: 'hello world', date: '2026-06-29T09:30:00.000Z', status: 'chat' });
    expect(records[1]!.title).toBe('chat-2'); // empty preview → id as label
  });
});

describe('native resume — ledger-first dual-read re-hydration (564-004)', () => {
  const roots: string[] = [];
  const makeRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'native-resume-'));
    roots.push(root);
    return root;
  };
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('hydrates ledger messages byte-for-byte and never consults legacy on collision', () => {
    const rootDir = makeRoot();
    const cwd = join(rootDir, 'project');
    const messages = [
      { role: 'user' as const, content: 'ledger question' },
      { role: 'assistant' as const, content: 'ledger answer' },
    ];
    appendLedgerTurn({
      rootDir, cwd, sessionId: 'shared', turnIndex: 0,
      ts: '2026-08-18T00:00:00.000Z', provider: 'p', model: 'm', messagesDelta: messages,
      usage: { inputTokens: 3, outputTokens: 7 },
    });
    const hydrateTranscript = vi.fn();
    const getChatHistory = vi.fn(() => [{ role: 'user', content: 'legacy shadow' }]);

    const result = hydrateNativeResume('shared', cwd, { hydrateTranscript }, { getChatHistory }, { rootDir });

    expect(result).toMatchObject({ source: 'ledger', messages, turnCount: 1, outputTokens: 7 });
    expect(hydrateTranscript).toHaveBeenCalledOnce();
    // 564-004 hand-completion — the ledger row count rides along so the bridge
    // recorder continues turn numbering after the hydrated rows.
    expect(hydrateTranscript).toHaveBeenCalledWith(messages, { nextTurnIndex: 1 });
    expect(getChatHistory).not.toHaveBeenCalled();
  });

  it('falls back to legacy history and converts only provider-compatible chat roles', () => {
    const rootDir = makeRoot();
    const cwd = join(rootDir, 'project');
    const hydrateTranscript = vi.fn();
    const getChatHistory = vi.fn(() => [
      { role: 'user', content: 'legacy question' },
      { role: 'assistant', content: 'legacy answer' },
    ]);

    const result = hydrateNativeResume('legacy-only', cwd, { hydrateTranscript }, { getChatHistory }, { rootDir });

    expect(result).toMatchObject({ source: 'legacy', turnCount: 1, outputTokens: 0 });
    expect(hydrateTranscript).toHaveBeenCalledWith([
      { role: 'user', content: 'legacy question' },
      { role: 'assistant', content: 'legacy answer' },
    ]);
  });

  it('deduplicates picker ids with ledger precedence', () => {
    const merged = mergeResumeSessionRecords(
      [record('sprint-only')],
      [record('shared', { title: 'ledger title', status: 'chat' })],
      [record('shared', { title: 'legacy title', status: 'chat' }), record('legacy-only', { status: 'chat' })],
    );
    expect([...merged.disk, ...merged.resumable].map((entry) => entry.id)).toEqual([
      'sprint-only', 'shared', 'legacy-only',
    ]);
    expect(merged.resumable.find((entry) => entry.id === 'shared')?.title).toBe('ledger title');
  });
});

// ─── resolveResumeCommand — picker decisions (merge with loop-side /resume) ──

describe('resolveResumeCommand — /resume picker decision matrix', () => {
  const disk = [record('sprint-357'), record('sprint-356')];
  const chat = chatSessionsToRecords([
    { sessionId: 'chat-abc', lastAt: '2026-06-30T12:00:00.000Z', preview: 'parser work' },
  ]);

  it('no local sessions at all → passthrough for every form (loop behavior byte-identical)', () => {
    expect(resolveResumeCommand('', [], [], NO_LABELS)).toEqual({ kind: 'passthrough' });
    expect(resolveResumeCommand('1', [], [], NO_LABELS)).toEqual({ kind: 'passthrough' });
    expect(resolveResumeCommand('some-id', [], [], NO_LABELS)).toEqual({ kind: 'passthrough' });
  });

  it('bare /resume → the numbered picker list (teaser-aligned)', () => {
    const decision = resolveResumeCommand('', disk, chat, NO_LABELS);
    expect(decision.kind).toBe('list');
    if (decision.kind === 'list') {
      expect(decision.lines).toEqual(buildResumePickerLines(disk, chat, NO_LABELS));
    }
  });

  it('numeric pick of a disk row → switch, sessionId CHANGES, no loop forward', () => {
    const launchSessionId = 'chat-launch';
    const decision = resolveResumeCommand('2', disk, chat, NO_LABELS);
    expect(decision).toEqual({
      kind: 'switch',
      sessionId: 'sprint-356',
      forwardToLoop: false,
      line: 'resumed: sprint-356',
    });
    // goCriteria: "/resume picker seçimi sessionId değiştirir" — the picked id
    // replaces the active session id the App tracks.
    if (decision.kind === 'switch') expect(decision.sessionId).not.toBe(launchSessionId);
  });

  it('numeric pick of a resumable row → switch for direct hydration (never the raw typed id)', () => {
    const decision = resolveResumeCommand('3', disk, chat, NO_LABELS);
    expect(decision).toMatchObject({ kind: 'switch', sessionId: 'chat-abc', forwardToLoop: true });
  });

  it('exact session id → switch (id match beats title matching)', () => {
    const decision = resolveResumeCommand('sprint-357', disk, chat, NO_LABELS);
    expect(decision).toMatchObject({ kind: 'switch', sessionId: 'sprint-357', forwardToLoop: false });
  });

  it('numeric out-of-range → reject (a number must NEVER pass through to the loop)', () => {
    const decision = resolveResumeCommand('9', disk, chat, NO_LABELS);
    expect(decision).toEqual({ kind: 'reject', line: 'session not found: 9' });
  });

  it('unknown literal id → passthrough (the loop may know it — behavior-merge)', () => {
    expect(resolveResumeCommand('chat-very-old', disk, chat, NO_LABELS)).toEqual({ kind: 'passthrough' });
  });

  it('ambiguous title prefix → reject listing every match', () => {
    const twins = [record('sprint-a', { title: 'deploy fix' }), record('sprint-b', { title: 'deploy docs' })];
    const decision = resolveResumeCommand('deploy', twins, [], NO_LABELS);
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') {
      expect(decision.line).toContain('sprint-a');
      expect(decision.line).toContain('sprint-b');
    }
  });

  it('switch/reject lines honor caller labels ({id}/{arg} templates)', () => {
    const labels = { resumeSwitched: 'devam: {id}', resumeNotFound: 'oturum yok: {arg}' };
    expect(resolveResumeCommand('1', disk, [], labels)).toMatchObject({ line: 'devam: sprint-357' });
    expect(resolveResumeCommand('7', disk, [], labels)).toMatchObject({ line: 'oturum yok: 7' });
  });
});

// ─── busy-controls wire — /queue /interrupt /steer × busy/idle matrix ────────

describe('busy matrix — parse → dispatch → renderBusyDecision (render-tests)', () => {
  const dispatchLine = (
    stateRef: { current: BusyControlsState },
    raw: string,
    deps: { size: () => number; cancel: () => void },
  ): string => {
    // Mirrors app.tsx handleSubmit's gated busy-command block 1:1.
    const action = parseBusyCommand(raw);
    if (action.kind === 'queue') {
      return renderBusyDecision(resolveQueueCommand(stateRef.current, { size: deps.size }), NO_LABELS);
    }
    if (action.kind === 'interrupt') {
      const r = applyInterrupt(stateRef.current, deps.cancel);
      stateRef.current = r.state;
      return renderBusyDecision(r.decision, NO_LABELS);
    }
    if (action.kind === 'steer') {
      const r = applySteer(stateRef.current, action.message);
      stateRef.current = r.state;
      return renderBusyDecision(r.decision, NO_LABELS);
    }
    throw new Error(`not a busy command: ${raw}`);
  };

  it('idle × /queue → idle status line with the background bucket count', () => {
    const stateRef = { current: initialBusyControlsState() };
    const line = dispatchLine(stateRef, '/queue', { size: () => 0, cancel: vi.fn() });
    expect(line).toBe('queue: 0 background · idle');
  });

  it('busy × /queue → busy status line, count from the REAL ChatTurnQueue', () => {
    const queue = createChatTurnQueue();
    queue.enqueueBg({ source: 'sprint-357', summary: 'done' });
    queue.enqueueBg({ source: 'tick-9', summary: 'done too' }); // different source → 2 buckets
    const stateRef = { current: markBusy() };
    const line = dispatchLine(stateRef, '/queue', { size: () => queue.size(), cancel: vi.fn() });
    expect(line).toBe('queue: 2 background · busy');
  });

  it('idle × /interrupt → noop line, canceller NEVER invoked', () => {
    const cancel = vi.fn();
    const stateRef = { current: initialBusyControlsState() };
    const line = dispatchLine(stateRef, '/interrupt', { size: () => 0, cancel });
    expect(line).toBe('nothing running to interrupt');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('busy × /interrupt → interrupt line, canceller invoked exactly once', () => {
    const cancel = vi.fn();
    const stateRef = { current: markBusy() };
    const line = dispatchLine(stateRef, '/interrupt', { size: () => 0, cancel });
    expect(line).toBe('interrupt requested — stopping after the current step');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stateRef.current.interruptRequested).toBe(true);
  });

  it('double interrupt (Esc then Esc / Esc then /interrupt) is idempotent — canceller fires once', () => {
    const cancel = vi.fn();
    const stateRef = { current: markBusy() };
    dispatchLine(stateRef, '/interrupt', { size: () => 0, cancel });
    const second = dispatchLine(stateRef, '/interrupt', { size: () => 0, cancel });
    expect(second).toBe('interrupt already requested');
    expect(cancel).toHaveBeenCalledTimes(1); // NOT re-invoked — çifte-Esc idempotent
  });

  it('idle × /steer → noop line, nothing queued', () => {
    const stateRef = { current: initialBusyControlsState() };
    const line = dispatchLine(stateRef, '/steer focus on tests', { size: () => 0, cancel: vi.fn() });
    expect(line).toBe('nothing running to steer');
    expect(stateRef.current.steerNotes).toEqual([]);
  });

  it('busy × /steer <msg> → FIFO positions #1, #2; blank message → usage line', () => {
    const stateRef = { current: markBusy() };
    expect(dispatchLine(stateRef, '/steer keep it minimal', { size: () => 0, cancel: vi.fn() }))
      .toBe('steer note queued (#1) — applied at turn end');
    expect(dispatchLine(stateRef, '/steer add tests', { size: () => 0, cancel: vi.fn() }))
      .toBe('steer note queued (#2) — applied at turn end');
    expect(dispatchLine(stateRef, '/steer', { size: () => 0, cancel: vi.fn() }))
      .toBe('usage: /steer <message>');
    expect(stateRef.current.steerNotes).toEqual(['keep it minimal', 'add tests']);
  });

  it('renderBusyDecision honors caller labels ({count}/{state}/{position} templates)', () => {
    const labels = {
      busyQueueStatus: 'kuyruk: {count} arkaplan · {state}',
      busyStateBusy: 'meşgul',
      busySteerQueued: 'not sıraya alındı (#{position})',
    };
    expect(renderBusyDecision({ kind: 'queue-status', busy: true, pendingBackgroundBuckets: 3 }, labels))
      .toBe('kuyruk: 3 arkaplan · meşgul');
    expect(renderBusyDecision({ kind: 'steer-queued', position: 2 }, labels))
      .toBe('not sıraya alındı (#2)');
  });
});

// ─── Esc key-map + turn-end steer drain (ChatTurnQueue contract) ─────────────

describe('Esc→interrupt key-map + turn-end steer drain', () => {
  it("resolveKeyAction('escape') → 'interrupt' (the contract app.tsx's useInput wires)", () => {
    expect(resolveKeyAction('escape')).toBe('interrupt');
  });

  it('steer notes drain ONLY at turn end, ahead of pending input, exactly once', () => {
    // Busy turn accumulates two steer notes (mid-turn: nothing is injected).
    let state = markBusy();
    state = applySteer(state, 'first note').state;
    state = applySteer(state, 'second note').state;

    // Turn end (markIdle) — the single drain point, mirroring app.tsx inputIter.
    const turnEnd = markIdle(state);
    expect(turnEnd.drainedSteerNotes).toEqual(['first note', 'second note']);

    // Drained notes steer NEXT work: they jump ahead of already-queued input.
    const pendingQueue = ['queued message'];
    expect(steerNotesToInputs(turnEnd.drainedSteerNotes, pendingQueue))
      .toEqual(['first note', 'second note', 'queued message']);

    // Single-drain semantics: a second turn end drains nothing.
    expect(markIdle(turnEnd.state).drainedSteerNotes).toEqual([]);
    // And an empty drain leaves the pending queue untouched.
    expect(steerNotesToInputs([], pendingQueue)).toEqual(pendingQueue);
  });
});
