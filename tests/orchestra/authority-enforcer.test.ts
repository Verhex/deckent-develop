import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkAuthority,
  emitAuthorityViolation,
  _testing,
  type AgentRole,
  type ActionType,
  type AuthorityCheckRequest,
} from '../../src/orchestra/authority-enforcer.js';

// ─── Mock event-stream ──────────────────────────────────────────────
vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(() => null),
  CHANNELS: {
    AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
    TASK_ASSIGN: 'BRAIN→WORKER:TASK_ASSIGN',
    HEARTBEAT: 'WORKER→BRAIN:HEARTBEAT',
    RESULT: 'WORKER→BRAIN:RESULT',
    QUESTION: 'WORKER→BRAIN:QUESTION',
    ANSWER: 'BRAIN→WORKER:ANSWER',
    CODE_VERIFY_REQUEST: 'WORKER→AUDITOR:CODE_VERIFY_REQUEST',
    VERIFICATION_RESULT: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    ADR_VIOLATION: 'AUDITOR→BRAIN:ADR_VIOLATION',
    GATE_COMPUTED: 'AUDITOR→BRAIN:GATE_COMPUTED',
    LOAD_REPORT_WRITTEN: 'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',
    METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
    FIX_REQUEST: 'BRAIN→WORKER:FIX_REQUEST',
    SPRINT_PHASE_CHANGE: 'BRAIN→*:SPRINT_PHASE_CHANGE',
    NOTIFY: 'DECKENT→USER:NOTIFY',
    ORPHAN_HB_DETECTED: 'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',
  },
}));

const { pathMatches, normalizePath } = _testing;

// ═══ Path Matching Tests ═════════════════════════════════════════════

describe('pathMatches', () => {
  it('matches exact paths', () => {
    expect(pathMatches('.brain/MEMORY.md', '.brain/MEMORY.md')).toBe(true);
    expect(pathMatches('.brain/MEMORY.md', '.brain/RETRO.md')).toBe(false);
  });

  it('matches directory wildcards (/**)', () => {
    expect(pathMatches('src/core/config.ts', 'src/**')).toBe(true);
    expect(pathMatches('src/deep/nested/file.ts', 'src/**')).toBe(true);
    expect(pathMatches('tests/test.ts', 'src/**')).toBe(false);
  });

  it('matches directory prefixes', () => {
    expect(pathMatches('.tasks/task-001.json', '.tasks/*')).toBe(true);
    expect(pathMatches('.tasks/task-002.hb', '.tasks/*')).toBe(true);
  });

  it('normalizes paths consistently', () => {
    expect(normalizePath('src\\core\\config.ts')).toBe('src/core/config.ts');
    expect(normalizePath('src/core/')).toBe('src/core');
  });
});

// ═══ Brain Authority Tests ═══════════════════════════════════════════

describe('Brain role authority', () => {
  it('permits Brain to write .tasks files', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: '.tasks/task-001.json',
    });
    expect(result.allowed).toBe(true);
    expect(result.level).toBe('permit');
  });

  it('permits Brain to write .brain/MEMORY.md', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: '.brain/MEMORY.md',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Brain to write .deckent/sprint-state.json', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: '.deckent/sprint-state.json',
    });
    expect(result.allowed).toBe(true);
  });

  it('denies Brain writing src/** (source code)', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: 'src/core/config.ts',
    });
    expect(result.allowed).toBe(false);
    expect(result.level).toBe('warn');
    expect(result.mode).toBe('soft');
    expect(result.reason).toContain('ADR-037');
  });

  it('denies Brain writing tests/**', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: 'tests/core/config.test.ts',
    });
    expect(result.allowed).toBe(false);
  });

  it('permits Brain to read src/**', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'read',
      target: 'src/core/config.ts',
    });
    expect(result.allowed).toBe(true);
  });

  it('denies Brain writing .brain/DECISIONS.md', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: '.brain/DECISIONS.md',
    });
    expect(result.allowed).toBe(false);
  });

  it('denies Brain writing .dashboard', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: '.dashboard',
    });
    expect(result.allowed).toBe(false);
  });
});

// ═══ Auditor Authority Tests ═════════════════════════════════════════

describe('Auditor role authority', () => {
  it('permits Auditor to write .dashboard', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'write',
      target: '.dashboard',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Auditor to read src/**', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'read',
      target: 'src/monitor/auditor.ts',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Auditor to write docs/audits/**', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'write',
      target: 'docs/audits/sprint-139/report.md',
    });
    expect(result.allowed).toBe(true);
  });

  it('denies Auditor writing src/** (audit independence)', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'write',
      target: 'src/monitor/auditor.ts',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('ADR-037');
  });

  it('denies Auditor writing tests/**', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'write',
      target: 'tests/monitor/auditor.test.ts',
    });
    expect(result.allowed).toBe(false);
  });

  it('denies Auditor writing .brain/MEMORY.md', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'write',
      target: '.brain/MEMORY.md',
    });
    expect(result.allowed).toBe(false);
  });

  it('permits Auditor to append .brain/PATTERNS.md', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'append',
      target: '.brain/PATTERNS.md',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Auditor to read .tasks/*.hb', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'read',
      target: '.tasks/task-001.hb',
    });
    expect(result.allowed).toBe(true);
  });
});

// ═══ Worker Authority Tests ══════════════════════════════════════════

describe('Worker role authority', () => {
  it('permits Worker to write within assigned scope directories', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'src/core/config.ts',
      taskId: '001',
      scopeDirectories: ['src/core/'],
      scopeFilesWrite: [],
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('Worker scope');
  });

  it('permits Worker to write assigned filesWrite', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'src/monitor/auditor.ts',
      taskId: '002',
      scopeDirectories: [],
      scopeFilesWrite: ['src/monitor/auditor.ts'],
    });
    expect(result.allowed).toBe(true);
  });

  it('denies Worker writing outside assigned scope', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'src/cli/commands/start.ts',
      taskId: '003',
      scopeDirectories: ['src/core/'],
      scopeFilesWrite: ['src/monitor/auditor.ts'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('scope violation');
  });

  it('denies Worker writing .brain/DECISIONS.md (privilege escalation)', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: '.brain/DECISIONS.md',
      taskId: '004',
    });
    expect(result.allowed).toBe(false);
  });

  it('denies Worker writing .dashboard (auditor exclusive)', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: '.dashboard',
      taskId: '005',
    });
    expect(result.allowed).toBe(false);
  });

  it('permits Worker to write own .tasks files', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: '.tasks/task-001.result',
      taskId: '001',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Worker to read .brain/DECISIONS.md (ADR-036 mandatory read)', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'read',
      target: '.brain/DECISIONS.md',
      taskId: '006',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Worker to read DIRECTIVES.md', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'read',
      target: 'DIRECTIVES.md',
      taskId: '007',
    });
    expect(result.allowed).toBe(true);
  });
});

// ═══ Self-Modifying Sprint Exception (ADR-038) ══════════════════════

describe('Self-modifying sprint exception (ADR-038)', () => {
  it('permits Worker to write src/** when isSelfModifyingSprint is true', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'src/core/config.ts',
      taskId: '100',
      isSelfModifyingSprint: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('Self-modifying sprint');
    expect(result.reason).toContain('ADR-038');
  });

  it('permits Worker to write tests/** when isSelfModifyingSprint is true', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: 'tests/core/config.test.ts',
      taskId: '101',
      isSelfModifyingSprint: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('Self-modifying sprint');
  });

  it('does NOT permit Worker to write .brain/DECISIONS.md even with self-modifying flag', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: '.brain/DECISIONS.md',
      taskId: '102',
      isSelfModifyingSprint: true,
    });
    // .brain/DECISIONS.md is ALWAYS denied for workers — ADR-038 only applies to src/tests
    expect(result.allowed).toBe(false);
  });

  it('does NOT activate self-modifying for Brain role', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: 'src/core/config.ts',
      isSelfModifyingSprint: true,
    });
    // ADR-038 exception is worker-only
    expect(result.allowed).toBe(false);
  });
});

// ═══ Event Stream Channel Authority Tests ════════════════════════════

describe('Event stream channel authority', () => {
  it('permits Brain to emit BRAIN→WORKER:TASK_ASSIGN', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'event_emit',
      target: 'BRAIN→WORKER:TASK_ASSIGN',
    });
    expect(result.allowed).toBe(true);
  });

  it('denies Brain emitting AUDITOR→BRAIN:VERIFICATION_RESULT', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'event_emit',
      target: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
    });
    expect(result.allowed).toBe(false);
  });

  it('permits Brain to consume WORKER→BRAIN:RESULT', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'event_consume',
      target: 'WORKER→BRAIN:RESULT',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Auditor to emit AUDITOR→BRAIN:GATE_COMPUTED', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'event_emit',
      target: 'AUDITOR→BRAIN:GATE_COMPUTED',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Worker to emit WORKER→BRAIN:HEARTBEAT', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'event_emit',
      target: 'WORKER→BRAIN:HEARTBEAT',
    });
    expect(result.allowed).toBe(true);
  });

  it('denies Worker emitting BRAIN→WORKER:TASK_ASSIGN (wrong source)', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'event_emit',
      target: 'BRAIN→WORKER:TASK_ASSIGN',
    });
    expect(result.allowed).toBe(false);
  });

  it('permits Worker to consume BRAIN→WORKER:FIX_REQUEST', () => {
    const result = checkAuthority({
      role: 'worker',
      action: 'event_consume',
      target: 'BRAIN→WORKER:FIX_REQUEST',
    });
    expect(result.allowed).toBe(true);
  });

  it('permits Auditor to consume broadcast BRAIN→*:SPRINT_PHASE_CHANGE', () => {
    const result = checkAuthority({
      role: 'auditor',
      action: 'event_consume',
      target: 'BRAIN→*:SPRINT_PHASE_CHANGE',
    });
    expect(result.allowed).toBe(true);
  });
});

// ═══ emitAuthorityViolation Tests ════════════════════════════════════

describe('emitAuthorityViolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits event to event stream on authority violation', async () => {
    const { writeEvent } = await import('../../src/orchestra/event-stream.js');

    const check: AuthorityCheckRequest = {
      role: 'worker',
      action: 'write',
      target: 'src/cli/commands/start.ts',
      taskId: '003',
    };

    const result = {
      allowed: false,
      level: 'warn' as const,
      mode: 'soft' as const,
      reason: 'scope violation',
    };

    emitAuthorityViolation('/tmp/test-project', 'sprint-139', check, result);

    expect(writeEvent).toHaveBeenCalledWith(
      '/tmp/test-project',
      'sprint-139',
      'auditor',
      'brain',
      'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
      expect.objectContaining({
        role: 'worker',
        action: 'write',
        target: 'src/cli/commands/start.ts',
        taskId: '003',
        allowed: false,
        level: 'warn',
        mode: 'soft',
      }),
    );
  });

  it('does not throw when writeEvent fails', async () => {
    const { writeEvent } = await import('../../src/orchestra/event-stream.js');
    vi.mocked(writeEvent).mockImplementation(() => { throw new Error('disk full'); });

    // Should not throw
    expect(() => {
      emitAuthorityViolation('/tmp/test-project', 'sprint-139', {
        role: 'worker',
        action: 'write',
        target: 'src/foo.ts',
      }, {
        allowed: false,
        level: 'warn',
        mode: 'soft',
        reason: 'test',
      });
    }).not.toThrow();
  });
});

// ═══ Enforcement Mode Tests ══════════════════════════════════════════

describe('Enforcement mode', () => {
  it('always returns mode: soft in Sprint 139', () => {
    const roles: AgentRole[] = ['brain', 'auditor', 'worker'];
    const actions: ActionType[] = ['read', 'write', 'append'];
    const targets = ['src/core/config.ts', '.brain/MEMORY.md', '.dashboard'];

    for (const role of roles) {
      for (const action of actions) {
        for (const target of targets) {
          const result = checkAuthority({ role, action, target });
          expect(result.mode).toBe('soft');
        }
      }
    }
  });

  it('returns fail-closed for unknown paths with write action', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'write',
      target: 'unknown/path/file.txt',
    });
    // Brain has no explicit permission for unknown paths — fail-closed
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('fail-closed');
  });

  it('returns allow for read on unknown paths (default read allow)', () => {
    const result = checkAuthority({
      role: 'brain',
      action: 'read',
      target: 'some/random/file.txt',
    });
    expect(result.allowed).toBe(true);
  });
});
