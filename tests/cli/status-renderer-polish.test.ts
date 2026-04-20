// ─── StatusRenderer Polish Tests (Task 145-018) ──────────────────────
// Snapshot + behavioral tests for:
//   - Phase color coding
//   - Worker health icons (🟢/🟡/🔴)
//   - Recent events icon map
//   - Terminal width responsive (ASCII fallback)
//   - Cost color coding
//   - Partial redraw line diff

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StatusRenderer,
  phaseColor,
  workerHealthIcon,
  eventIcon,
  costColor,
  progressBar,
  type RecentEvent,
} from '../../src/cli/helpers/status-renderer.js';
import type { AgentInfo } from '../../src/core/types.js';
import { AgentStatus } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function hasAnsiCode(s: string, code: string): boolean {
  return s.includes(`\x1b[${code}m`);
}

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'w-145-001',
    role: 'worker',
    status: AgentStatus.EXECUTING,
    model: 'sonnet',
    tmuxWindow: 'deckent:001',
    taskId: '145-001',
    lastHeartbeat: new Date().toISOString(),
    ...overrides,
  } as AgentInfo;
}

// ─── 1. phaseColor — phase renk testi ───────────────────────────────

describe('phaseColor', () => {
  it('PLAN → gray (ANSI 90)', () => {
    const result = phaseColor('PLAN', false);
    expect(hasAnsiCode(result, '90')).toBe(true);
    expect(stripAnsi(result)).toBe('PLAN');
  });

  it('EXECUTE → blue (ANSI 34)', () => {
    const result = phaseColor('EXECUTE', false);
    expect(hasAnsiCode(result, '34')).toBe(true);
    expect(stripAnsi(result)).toBe('EXECUTE');
  });

  it('EVALUATE → yellow (ANSI 33)', () => {
    const result = phaseColor('EVALUATE', false);
    expect(hasAnsiCode(result, '33')).toBe(true);
    expect(stripAnsi(result)).toBe('EVALUATE');
  });

  it('RETRO → green (ANSI 32)', () => {
    const result = phaseColor('RETRO', false);
    expect(hasAnsiCode(result, '32')).toBe(true);
    expect(stripAnsi(result)).toBe('RETRO');
  });

  it('noColor=true → returns plain string', () => {
    expect(phaseColor('PLAN', true)).toBe('PLAN');
    expect(phaseColor('EXECUTE', true)).toBe('EXECUTE');
  });

  it('PLAN phase renk snapshot', () => {
    const result = phaseColor('PLAN', false);
    expect(result).toMatchInlineSnapshot(`"\x1b[90mPLAN\x1b[0m"`);
  });
});

// ─── 2. workerHealthIcon — worker status icon testi ──────────────────

describe('workerHealthIcon', () => {
  it('fresh heartbeat (< 2min) → 🟢', () => {
    const now = new Date('2026-04-20T10:00:00Z');
    const agent = makeAgent({ lastHeartbeat: '2026-04-20T09:59:00Z' }); // 1min ago
    expect(workerHealthIcon(agent, now)).toBe('🟢');
  });

  it('stale heartbeat (> 2min < 5min) → 🟡', () => {
    const now = new Date('2026-04-20T10:00:00Z');
    const agent = makeAgent({ lastHeartbeat: '2026-04-20T09:57:00Z' }); // 3min ago
    expect(workerHealthIcon(agent, now)).toBe('🟡');
  });

  it('stale heartbeat (> 5min) → 🔴', () => {
    const now = new Date('2026-04-20T10:00:00Z');
    const agent = makeAgent({ lastHeartbeat: '2026-04-20T09:54:00Z' }); // 6min ago
    expect(workerHealthIcon(agent, now)).toBe('🔴');
  });

  it('no heartbeat → 🔴', () => {
    const agent = makeAgent({ lastHeartbeat: undefined });
    expect(workerHealthIcon(agent)).toBe('🔴');
  });

  it('exactly 2min → 🟡 (boundary)', () => {
    const now = new Date('2026-04-20T10:00:00Z');
    const agent = makeAgent({ lastHeartbeat: '2026-04-20T09:58:00Z' }); // exactly 2min ago
    expect(workerHealthIcon(agent, now)).toBe('🟡');
  });
});

// ─── 3. eventIcon — recent events icon map testi ─────────────────────

describe('eventIcon', () => {
  it('RESULT-DONE → ✅', () => {
    expect(eventIcon('RESULT-DONE')).toBe('✅');
  });

  it('SPAWN → 🔁', () => {
    expect(eventIcon('SPAWN')).toBe('🔁');
  });

  it('NO_GO → ❌', () => {
    expect(eventIcon('NO_GO')).toBe('❌');
  });

  it('ALERT → ⚠️', () => {
    expect(eventIcon('ALERT')).toBe('⚠️');
  });

  it('NOTIFY → 🔵', () => {
    expect(eventIcon('NOTIFY')).toBe('🔵');
  });

  it('unknown type → •', () => {
    expect(eventIcon('UNKNOWN_EVENT')).toBe('•');
  });

  it('case insensitive matching', () => {
    expect(eventIcon('result-done')).toBe('✅');
    expect(eventIcon('spawn')).toBe('🔁');
    expect(eventIcon('no_go')).toBe('❌');
  });
});

// ─── 4. Terminal width — ASCII fallback testi ─────────────────────────

describe('StatusRenderer terminal width', () => {
  it('60-col → ASCII fallback box drawing', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
      terminalWidth: 55,  // < 60 → ASCII fallback
    });
    const output = renderer.snapshot();
    // ASCII box uses + and - instead of ╭ and ─
    expect(output).toContain('+');
    expect(output).toContain('-');
    expect(output).not.toContain('╭');
    expect(output).not.toContain('╰');
    expect(output).not.toContain('├');
  });

  it('80-col → Unicode box drawing', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
      terminalWidth: 80,  // >= 60 → Unicode
    });
    const output = renderer.snapshot();
    expect(output).toContain('╭');
    expect(output).toContain('╰');
  });

  it('ASCII fallback snapshot (55 cols)', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
      terminalWidth: 55,
    });
    const output = renderer.snapshot();
    const firstLine = output.split('\n')[0];
    // Should start with +-- pattern
    expect(firstLine).toMatch(/^\+[-]+\+$/);
  });
});

// ─── 5. costColor — cost renk testi ─────────────────────────────────

describe('costColor', () => {
  it('< 50% → green (ANSI 32)', () => {
    const result = costColor(30, '30%', false);
    expect(hasAnsiCode(result, '32')).toBe(true);
    expect(stripAnsi(result)).toBe('30%');
  });

  it('50-80% → yellow (ANSI 33)', () => {
    const result = costColor(65, '65%', false);
    expect(hasAnsiCode(result, '33')).toBe(true);
    expect(stripAnsi(result)).toBe('65%');
  });

  it('85% → red (ANSI 31)', () => {
    const result = costColor(85, '85%', false);
    expect(hasAnsiCode(result, '31')).toBe(true);
    expect(stripAnsi(result)).toBe('85%');
  });

  it('exactly 80% → red (boundary: >=80 is red)', () => {
    const result = costColor(80, '80%', false);
    expect(hasAnsiCode(result, '31')).toBe(true);
  });

  it('noColor=true → plain text', () => {
    const result = costColor(85, '85%', true);
    expect(result).toBe('85%');
    expect(result).not.toContain('\x1b');
  });

  it('cost 85% → red color snapshot', () => {
    const result = costColor(85, '85%', false);
    expect(result).toMatchInlineSnapshot(`"\x1b[31m85%\x1b[0m"`);
  });
});

// ─── 6. partialRedraw — sadece değişen satır testi ───────────────────

describe('StatusRenderer.partialRedraw', () => {
  let stdoutWrites: string[];
  let writeStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stdoutWrites = [];
    writeStub = vi.fn((s: string) => { stdoutWrites.push(s); return true; });
    vi.spyOn(process.stdout, 'write').mockImplementation(writeStub as unknown as typeof process.stdout.write);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('first partialRedraw → full write (clears screen)', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
    });
    renderer.partialRedraw('line1\nline2\nline3');
    const combined = stdoutWrites.join('');
    // Full screen clear on first render
    expect(combined).toContain('\x1b[2J');
  });

  it('second partialRedraw with 1 changed line → only that line rewritten', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
    });

    // First render: establishes baseline
    renderer.partialRedraw('line1\nline2\nline3');
    stdoutWrites.length = 0; // reset capture

    // Second render: only line2 changes
    const redrawnCount = renderer.partialRedraw('line1\nLINE2-CHANGED\nline3');

    expect(redrawnCount).toBe(1); // only 1 line changed
    const combined = stdoutWrites.join('');
    // Should contain the changed content
    expect(combined).toContain('LINE2-CHANGED');
    // Should NOT contain a full screen clear
    expect(combined).not.toContain('\x1b[2J');
  });

  it('partialRedraw with no changes → 0 lines redrawn', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
    });

    renderer.partialRedraw('line1\nline2');
    stdoutWrites.length = 0;

    const redrawnCount = renderer.partialRedraw('line1\nline2');
    expect(redrawnCount).toBe(0);
    expect(stdoutWrites.length).toBe(0);
  });

  it('partialRedraw with multiple changes → correct count', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
    });

    renderer.partialRedraw('a\nb\nc\nd');
    stdoutWrites.length = 0;

    const redrawnCount = renderer.partialRedraw('A\nb\nC\nd');
    expect(redrawnCount).toBe(2); // lines 0 and 2 changed
  });

  it('resetRedrawState → next call does full write', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
    });

    renderer.partialRedraw('line1\nline2');
    renderer.resetRedrawState();
    stdoutWrites.length = 0;

    renderer.partialRedraw('line1\nline2');
    const combined = stdoutWrites.join('');
    // After reset, should do full write again
    expect(combined).toContain('\x1b[2J');
  });
});

// ─── 7. progressBar — gradient renk testi ────────────────────────────

describe('progressBar', () => {
  it('low progress → green filled region', () => {
    const result = progressBar(3, 10, 20, false); // 30% → green
    expect(hasAnsiCode(result, '32')).toBe(true);
  });

  it('>= 80% → yellow filled region (warning)', () => {
    const result = progressBar(9, 10, 20, false); // 90% → yellow
    expect(hasAnsiCode(result, '33')).toBe(true);
  });

  it('noColor=true → no ANSI codes', () => {
    const result = progressBar(5, 10, 20, true);
    expect(result).not.toContain('\x1b');
    expect(result).toContain('██');
    expect(result).toContain('░');
  });

  it('total=0 → empty bar (all░)', () => {
    const result = progressBar(0, 0, 10, true);
    expect(result).toBe('░░░░░░░░░░');
  });

  it('done > total → capped at 100%', () => {
    const result = progressBar(15, 10, 20, true);
    expect(result).toContain('(100%)');
  });
});

// ─── 8. snapshot() — events icon rendering ────────────────────────────

describe('StatusRenderer.snapshot events', () => {
  it('renders events with correct icons', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
      terminalWidth: 80,
    });

    const events: RecentEvent[] = [
      { type: 'RESULT-DONE', message: 'task-001 complete', timestamp: new Date().toISOString() },
      { type: 'SPAWN', message: 'worker spawned', timestamp: new Date().toISOString() },
      { type: 'NO_GO', message: 'task-002 failed', timestamp: new Date().toISOString() },
      { type: 'ALERT', message: 'stale heartbeat', timestamp: new Date().toISOString() },
      { type: 'NOTIFY', message: 'user notified', timestamp: new Date().toISOString() },
    ];

    const output = renderer.snapshot(events);
    expect(output).toContain('✅');
    expect(output).toContain('🔁');
    expect(output).toContain('❌');
    expect(output).toContain('⚠️');
    expect(output).toContain('🔵');
  });

  it('no events → "Recent Events: none"', () => {
    const renderer = new StatusRenderer({
      projectRoot: '/tmp/nonexistent-project-abc123',
      noColor: true,
      terminalWidth: 80,
    });
    const output = renderer.snapshot([]);
    expect(output).toContain('Recent Events: none');
  });
});
