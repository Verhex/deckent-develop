// status-renderer.test.ts — StatusRenderer + its pure exported helpers.
//
// StatusRenderer is a plain class (not an Ink/React component), so no
// mounting concerns apply here — every method is called directly. File I/O
// (dashboard/tasks/config/live-activity reads) uses real hermetic tmpdir
// fixtures (Test Hermeticity rule: no gitignored state, no mocked fs).
//
// NOT covered here by design (PTY/terminal-only, no unit-test seam):
// real terminal resize reconciliation and actual stdout rendering fidelity
// (partialRedraw/redraw are asserted via a process.stdout.write spy, not a
// real terminal). The "Pending approvals" box section (readPendingApprovals)
// is exercised only in its empty-state path — its on-disk nervous/autonomous
// hub format is covered by tests/core/pending-approvals tests elsewhere.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StatusRenderer,
  phaseColor,
  workerHealthIcon,
  eventIcon,
  costColor,
  progressBar,
  readLatestActivity,
} from '../../../src/cli/helpers/status-renderer.js';
import { AgentStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { AgentInfo, DashboardState } from '../../../src/core/types.js';

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'w-001',
    role: 'worker',
    status: AgentStatus.EXECUTING,
    model: 'sonnet',
    tmuxWindow: 'w1',
    ...overrides,
  } as AgentInfo;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

describe('phaseColor', () => {
  it('returns the raw phase string when noColor is true', () => {
    for (const phase of ['PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'DECAY', 'COMPLETE', 'UNKNOWN']) {
      expect(phaseColor(phase, true)).toBe(phase);
    }
  });

  it('wraps known phases in ANSI color codes when noColor is false', () => {
    for (const phase of ['PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'DECAY', 'COMPLETE']) {
      const colored = phaseColor(phase, false);
      expect(colored).not.toBe(phase);
      expect(stripAnsi(colored)).toBe(phase);
    }
  });

  it('falls back to dim color for an unrecognized phase', () => {
    const colored = phaseColor('WEIRD', false);
    expect(stripAnsi(colored)).toBe('WEIRD');
    expect(colored).not.toBe('WEIRD');
  });
});

describe('workerHealthIcon', () => {
  const now = new Date('2026-07-18T12:00:00.000Z');

  it('returns 🔴 when there is no heartbeat at all', () => {
    expect(workerHealthIcon(makeAgent({ lastHeartbeat: undefined }), now)).toBe('🔴');
  });

  it('returns 🟢 for a heartbeat under 2 minutes old', () => {
    const hb = new Date(now.getTime() - 60_000).toISOString();
    expect(workerHealthIcon(makeAgent({ lastHeartbeat: hb }), now)).toBe('🟢');
  });

  it('returns 🟡 for a heartbeat between 2 and 5 minutes old', () => {
    const hb = new Date(now.getTime() - 3 * 60_000).toISOString();
    expect(workerHealthIcon(makeAgent({ lastHeartbeat: hb }), now)).toBe('🟡');
  });

  it('returns 🔴 for a heartbeat older than 5 minutes', () => {
    const hb = new Date(now.getTime() - 6 * 60_000).toISOString();
    expect(workerHealthIcon(makeAgent({ lastHeartbeat: hb }), now)).toBe('🔴');
  });
});

describe('eventIcon', () => {
  it('maps RESULT+DONE to ✅', () => {
    expect(eventIcon('RESULT-DONE')).toBe('✅');
  });

  it('maps SPAWN to 🔁', () => {
    expect(eventIcon('SPAWN')).toBe('🔁');
  });

  it('maps NO_GO / NOGO to ❌', () => {
    expect(eventIcon('NO_GO')).toBe('❌');
    expect(eventIcon('NOGO')).toBe('❌');
  });

  it('maps ALERT to ⚠️', () => {
    expect(eventIcon('ALERT')).toBe('⚠️');
  });

  it('maps NOTIFY to 🔵', () => {
    expect(eventIcon('NOTIFY')).toBe('🔵');
  });

  it('falls back to • for an unrecognized event type', () => {
    expect(eventIcon('MYSTERY')).toBe('•');
  });

  it('is case-insensitive', () => {
    expect(eventIcon('result-done')).toBe('✅');
  });
});

describe('costColor', () => {
  it('returns plain text when noColor is true, regardless of pct', () => {
    expect(costColor(10, 'label', true)).toBe('label');
    expect(costColor(90, 'label', true)).toBe('label');
  });

  it('colors green under 50%', () => {
    const out = costColor(30, 'label', false);
    expect(out).not.toBe('label');
    expect(stripAnsi(out)).toBe('label');
  });

  it('colors yellow between 50% and 80%', () => {
    const out = costColor(65, 'label', false);
    expect(stripAnsi(out)).toBe('label');
  });

  it('colors red at 80% or above', () => {
    const out = costColor(85, 'label', false);
    expect(stripAnsi(out)).toBe('label');
  });
});

describe('progressBar', () => {
  it('renders all-empty bar when total is 0', () => {
    const bar = progressBar(0, 0, 10, true);
    expect(bar).toBe('░'.repeat(10));
  });

  it('renders the done/total (pct%) label', () => {
    const bar = progressBar(3, 4, 20, true);
    expect(bar).toContain('3/4 (75%)');
  });

  it('renders fully filled bar at 100%', () => {
    const bar = progressBar(5, 5, 10, true);
    expect(bar).toContain('█'.repeat(10));
  });

  it('applies color when noColor is false', () => {
    const bar = progressBar(2, 4, 10, false);
    expect(stripAnsi(bar)).not.toBe(bar);
  });
});

describe('readLatestActivity', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'status-renderer-activity-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns [] when the events file does not exist', () => {
    expect(readLatestActivity(root, 'sprint-999')).toEqual([]);
  });

  it('returns the latest ACTIVITY line per task, keyed by taskId', () => {
    const dir = join(root, '.deckent', 'recently-works');
    mkdirSync(dir, { recursive: true });
    const lines = [
      JSON.stringify({ channel: 'WORKER→*:ACTIVITY', payload: { taskId: 't-001', line: 'editing src/a.ts', kind: 'file' } }),
      JSON.stringify({ channel: 'OTHER:CHANNEL', payload: { taskId: 't-001', line: 'ignored', kind: 'file' } }),
      JSON.stringify({ channel: 'WORKER→*:ACTIVITY', payload: { taskId: 't-001', line: 'running tests', kind: 'status' } }),
      JSON.stringify({ channel: 'WORKER→*:ACTIVITY', payload: { taskId: 't-002', line: 'planning', kind: 'status' } }),
    ];
    writeFileSync(join(dir, 'sprint-042-events.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const activity = readLatestActivity(root, 'sprint-042');
    expect(activity).toHaveLength(2);
    const t1 = activity.find((a) => a.taskId === 't-001');
    expect(t1?.line).toBe('running tests'); // last wins
    const t2 = activity.find((a) => a.taskId === 't-002');
    expect(t2?.line).toBe('planning');
  });

  it('skips malformed/torn lines without throwing', () => {
    const dir = join(root, '.deckent', 'recently-works');
    mkdirSync(dir, { recursive: true });
    const lines = [
      '{not valid json',
      JSON.stringify({ channel: 'WORKER→*:ACTIVITY', payload: { taskId: 't-001', line: 'ok', kind: 'status' } }),
    ];
    writeFileSync(join(dir, 'sprint-042-events.jsonl'), lines.join('\n') + '\n', 'utf-8');

    expect(() => readLatestActivity(root, 'sprint-042')).not.toThrow();
    const activity = readLatestActivity(root, 'sprint-042');
    expect(activity).toEqual([{ taskId: 't-001', line: 'ok', kind: 'status' }]);
  });

  it('caps the returned rows at maxTasks', () => {
    const dir = join(root, '.deckent', 'recently-works');
    mkdirSync(dir, { recursive: true });
    const lines = Array.from({ length: 8 }, (_, i) =>
      JSON.stringify({ channel: 'WORKER→*:ACTIVITY', payload: { taskId: `t-${i}`, line: `line ${i}`, kind: 'status' } }),
    );
    writeFileSync(join(dir, 'sprint-042-events.jsonl'), lines.join('\n') + '\n', 'utf-8');

    expect(readLatestActivity(root, 'sprint-042', 3)).toHaveLength(3);
  });
});

// ─── StatusRenderer ─────────────────────────────────────────────────────────

describe('StatusRenderer.snapshot', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'status-renderer-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders an honest "unknown" snapshot with no dashboard, tasks, or config', () => {
    const renderer = new StatusRenderer({ projectRoot: root, noColor: true, terminalWidth: 80 });
    const out = renderer.snapshot();
    expect(out).toContain('unknown');
    expect(out).toContain('IDLE');
    expect(out).toContain('0 workers');
    expect(out).toContain('Active Workers: none');
    expect(out).toContain('Recent Events: none');
    expect(out).toContain('Alerts: 0');
    expect(out).toContain('NO_GO: 0');
  });

  it('reads sprintId, phase, progress, and agents from .dashboard when present', () => {
    const dashboard: DashboardState = {
      sprint: { id: 'sprint-042', number: 42, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
      agents: [makeAgent({ id: 'w-a', status: AgentStatus.EXECUTING, taskId: 'task-001' })],
      progress: { done: 2, active: 1, blocked: 0, total: 5 },
      alerts: [],
      updatedAt: '2026-07-18T12:00:00.000Z',
    };
    writeFileSync(join(root, '.dashboard'), JSON.stringify(dashboard), 'utf-8');

    const renderer = new StatusRenderer({ projectRoot: root, noColor: true, terminalWidth: 80 });
    const out = renderer.snapshot();
    expect(out).toContain('sprint-042');
    expect(out).toContain('EXECUTE');
    expect(out).toContain('2/5');
    expect(out).toContain('w-a');
    expect(out).toContain('task-001');
  });

  it('falls back to task files to detect sprintId when no dashboard exists', () => {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(
      join(root, '.tasks', 'task-001.json'),
      JSON.stringify({ id: '001', title: 'Canonical task', status: 'DONE', sprintId: 'sprint-777' }),
      'utf-8',
    );
    writeFileSync(
      join(root, '.tasks', 'task-001.landing-proposal.json'),
      JSON.stringify({ sprintId: 'sprint-sidecar', status: 'NO_GO' }),
      'utf-8',
    );
    writeFileSync(
      join(root, '.tasks', 'task-002.json'),
      JSON.stringify({}),
      'utf-8',
    );

    const renderer = new StatusRenderer({ projectRoot: root, noColor: true, terminalWidth: 80 });
    const out = renderer.snapshot();
    expect(out).toContain('sprint-777');
    expect(out).toContain('1/1'); // 1 DONE task out of 1 total
  });

  it('reads sprint_started_at / sprint_hard_timeout from .deckent/config.json', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(
      join(root, '.deckent', 'config.json'),
      JSON.stringify({ sprint_started_at: new Date(Date.now() - 5 * 60_000).toISOString(), sprint_hard_timeout: 3_600_000 }),
      'utf-8',
    );

    const renderer = new StatusRenderer({ projectRoot: root, noColor: true, terminalWidth: 80 });
    const out = renderer.snapshot();
    expect(out).toContain('Hard cap: 60m');
  });

  it('uses ASCII box-drawing below the 60-column unicode threshold', () => {
    const renderer = new StatusRenderer({ projectRoot: root, noColor: true, terminalWidth: 40 });
    const out = renderer.snapshot();
    expect(out).toContain('+--');
    expect(out).not.toContain('╭');
  });

  it('uses unicode box-drawing at or above the 60-column threshold', () => {
    const renderer = new StatusRenderer({ projectRoot: root, noColor: true, terminalWidth: 80 });
    const out = renderer.snapshot();
    expect(out).toContain('╭');
    expect(out).toContain('╰');
  });

  it('strips ANSI color codes entirely when noColor is true', () => {
    const renderer = new StatusRenderer({ projectRoot: root, noColor: true, terminalWidth: 80 });
    const out = renderer.snapshot();
    expect(out).toBe(stripAnsi(out));
  });

  it('renders recent events with icons when provided', () => {
    const renderer = new StatusRenderer({ projectRoot: root, noColor: true, terminalWidth: 80 });
    const out = renderer.snapshot([{ type: 'SPAWN', message: 'w-1 started', timestamp: '2026-07-18T12:00:00.000Z' }]);
    expect(out).toContain('🔁');
    expect(out).toContain('w-1 started');
  });
});

describe('StatusRenderer.renderCost', () => {
  it('delegates to costColor using the configured noColor setting', () => {
    const renderer = new StatusRenderer({ projectRoot: '/tmp', noColor: true });
    expect(renderer.renderCost(90, '90% used')).toBe('90% used');
  });
});

describe('StatusRenderer.redraw / partialRedraw / resetRedrawState', () => {
  it('redraw clears the screen and writes the full content', () => {
    const renderer = new StatusRenderer({ projectRoot: '/tmp', noColor: true, terminalWidth: 80 });
    const writes: string[] = [];
    const spy = (chunk: string): boolean => { writes.push(chunk); return true; };
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = spy as typeof process.stdout.write;
    try {
      renderer.redraw('hello');
    } finally {
      process.stdout.write = orig;
    }
    expect(writes.join('')).toContain('hello');
  });

  it('partialRedraw does a full write on the first call', () => {
    const renderer = new StatusRenderer({ projectRoot: '/tmp', noColor: true, terminalWidth: 80 });
    const writes: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => { writes.push(chunk); return true; }) as typeof process.stdout.write;
    let redrawn: number;
    try {
      redrawn = renderer.partialRedraw('line1\nline2');
    } finally {
      process.stdout.write = orig;
    }
    expect(redrawn).toBe(2);
    expect(writes.join('')).toContain('line1\nline2');
  });

  it('partialRedraw only rewrites changed lines on subsequent calls', () => {
    const renderer = new StatusRenderer({ projectRoot: '/tmp', noColor: true, terminalWidth: 80 });
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    let redrawn: number;
    try {
      renderer.partialRedraw('line1\nline2\nline3');
      redrawn = renderer.partialRedraw('line1\nCHANGED\nline3');
    } finally {
      process.stdout.write = orig;
    }
    expect(redrawn).toBe(1);
  });

  it('resetRedrawState forces the next partialRedraw to be a full write', () => {
    const renderer = new StatusRenderer({ projectRoot: '/tmp', noColor: true, terminalWidth: 80 });
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    let redrawn: number;
    try {
      renderer.partialRedraw('line1\nline2');
      renderer.resetRedrawState();
      redrawn = renderer.partialRedraw('line1\nline2');
    } finally {
      process.stdout.write = orig;
    }
    expect(redrawn).toBe(2); // full write again, not 0 unchanged lines
  });
});
