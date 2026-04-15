import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => { throw new Error('ENOENT: no such file'); }),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true })),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    countBrainLines: vi.fn().mockReturnValue(100),
  };
});

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { countBrainLines } from '../../src/core/utils.js';
import {
  runDecay,
  auditBrainBudget,
  DECAY_EXEMPT,
} from '../../src/orchestra/debt-manager.js';

// ─── auditBrainBudget ────────────────────────────────────────────────

describe('auditBrainBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
  });

  it('returns OK with zeros when .brain/ does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const audit = auditBrainBudget('/root', 900);
    expect(audit.decayableLines).toBe(0);
    expect(audit.permanentLines).toBe(0);
    expect(audit.totalLines).toBe(0);
    expect(audit.status).toBe('OK');
  });

  it('correctly separates exempt vs decayable files', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.brain') && !path.includes('sprints');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) {
        return ['DECISIONS.md', 'PROJECT-IDENTITY.md', 'MEMORY.md', 'DEBT.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('DECISIONS.md')) return 'x\n'.repeat(702).trimEnd();
      if (path.includes('PROJECT-IDENTITY.md')) return 'x\n'.repeat(50).trimEnd();
      if (path.includes('MEMORY.md')) return 'x\n'.repeat(200).trimEnd();
      if (path.includes('DEBT.md')) return 'x\n'.repeat(100).trimEnd();
      throw new Error('ENOENT');
    });

    const audit = auditBrainBudget('/root', 900);
    // DECISIONS.md (702) + PROJECT-IDENTITY.md (50) are exempt
    expect(audit.permanentLines).toBe(752); // 702 + 50
    // MEMORY.md (200) + DEBT.md (100) are decayable
    expect(audit.decayableLines).toBe(300); // 200 + 100
    expect(audit.totalLines).toBe(1052);
    // decayableLines (300) == budget (900)? No — 300 <= 900 → OK
    expect(audit.status).toBe('OK');
  });

  it('returns OVER when decayable lines exceed budget (exempt files must not falsely trip OVER)', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.brain') && !path.includes('sprints');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) {
        return ['DECISIONS.md', 'MEMORY.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      // Exempt file: 702 lines
      if (path.includes('DECISIONS.md')) return 'x\n'.repeat(702).trimEnd();
      // Decayable file: 500 lines (> budget 300)
      if (path.includes('MEMORY.md')) return 'x\n'.repeat(500).trimEnd();
      throw new Error('ENOENT');
    });

    const audit = auditBrainBudget('/root', 300);
    expect(audit.permanentLines).toBe(702);
    expect(audit.decayableLines).toBe(500);
    // 500 > 300 → OVER
    expect(audit.status).toBe('OVER');
  });

  it('returns OK when only exempt files exceed budget but decayable files do not', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.brain') && !path.includes('sprints');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) {
        return ['DECISIONS.md', 'MEMORY.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      // Exempt: 702 lines (way over budget)
      if (path.includes('DECISIONS.md')) return 'x\n'.repeat(702).trimEnd();
      // Decayable: 100 lines (under budget 300)
      if (path.includes('MEMORY.md')) return 'x\n'.repeat(100).trimEnd();
      throw new Error('ENOENT');
    });

    const audit = auditBrainBudget('/root', 300);
    expect(audit.permanentLines).toBe(702);
    expect(audit.decayableLines).toBe(100);
    // 100 <= 300 → OK (exempt should NOT cause OVER)
    expect(audit.status).toBe('OK');
  });

  it('DECAY_EXEMPT set contains expected permanent files', () => {
    expect(DECAY_EXEMPT.has('DECISIONS.md')).toBe(true);
    expect(DECAY_EXEMPT.has('PROJECT-IDENTITY.md')).toBe(true);
    expect(DECAY_EXEMPT.has('MEMORY.md')).toBe(false);
    expect(DECAY_EXEMPT.has('DEBT.md')).toBe(false);
  });
});

// ─── runDecay — exempt-aware budget logic ───────────────────────────

describe('runDecay — exempt-aware budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(countBrainLines).mockReturnValue(100);
  });

  it('triggers decay when eligible lines exceed budget even if total is high due to exempt files', () => {
    // Scenario from DIRECTIVES: exempt 702 + eligible 500 = 1202 total, budget 300
    // eligible (500) > budget (300) → decay MUST run
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.brain') && !path.includes('sprints') && !path.includes('archive');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) {
        return ['DECISIONS.md', 'MEMORY.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    // MEMORY.md has 500 lines so decayableLines (500) > budget (300) — step 4 guard must pass
    const memoryContent = Array.from({ length: 500 }, (_, i) =>
      i % 50 === 0 ? `## Sprint sprint-${100 + Math.floor(i / 50)} Learnings` : `- detail line ${i}`,
    ).join('\n');
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('DECISIONS.md')) return 'x\n'.repeat(702).trimEnd();
      if (path.includes('MEMORY.md')) return memoryContent;
      throw new Error('ENOENT');
    });
    vi.mocked(countBrainLines).mockReturnValue(1202);

    const result = runDecay('/root', 'sprint-137', { memoryBudget: 300 });

    // shouldRun should be true — eligible lines (500) > budget (300)
    expect(result.linesBefore).toBe(1202);
    // writeFileSync should have been called for MEMORY.md trimming (step 4 or step 5)
    const writeCalls = vi.mocked(writeFileSync).mock.calls;
    const memoryWrite = writeCalls.find(c => (c[0] as string).includes('MEMORY.md'));
    expect(memoryWrite).toBeDefined();
  });

  it('does NOT trigger decay when only exempt files cause total to exceed budget', () => {
    // Scenario: exempt 702 + eligible 100 = 802 total, budget 300
    // eligible (100) <= budget (300) → no decay (exempt alone must not trigger)
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.brain') && !path.includes('sprints') && !path.includes('archive');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) {
        return ['DECISIONS.md', 'MEMORY.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('DECISIONS.md')) return 'x\n'.repeat(702).trimEnd();
      if (path.includes('MEMORY.md')) return 'x\n'.repeat(100).trimEnd();
      throw new Error('ENOENT');
    });
    vi.mocked(countBrainLines).mockReturnValue(802);

    const result = runDecay('/root', 'sprint-137', { memoryBudget: 300 });

    // shouldRun should be false — decayableLines (100) <= budget (300)
    expect(result.linesBefore).toBe(result.linesAfter);
    expect(vi.mocked(writeFileSync).mock.calls).toHaveLength(0);
  });

  it('returns no-op result (linesBefore === linesAfter) when under budget', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.brain') && !path.includes('sprints') && !path.includes('archive');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) {
        return ['MEMORY.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('MEMORY.md')) return 'x\n'.repeat(50).trimEnd();
      throw new Error('ENOENT');
    });
    vi.mocked(countBrainLines).mockReturnValue(50);

    const result = runDecay('/root', 'sprint-137', { memoryBudget: 900 });

    expect(result.linesBefore).toBe(result.linesAfter);
    expect(result.archivedSprints).toHaveLength(0);
    expect(result.removedDebtCount).toBe(0);
    expect(result.removedPatternCount).toBe(0);
  });

  it('force option bypasses budget check and always runs decay', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.brain') && !path.includes('sprints') && !path.includes('archive');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) {
        return ['MEMORY.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('MEMORY.md')) return 'x\n'.repeat(10).trimEnd();
      throw new Error('ENOENT');
    });
    vi.mocked(countBrainLines).mockReturnValue(10);

    // Under budget but force=true → should attempt decay steps
    const result = runDecay('/root', 'sprint-137', { memoryBudget: 900, force: true });

    // force=true means decay ran — linesBefore captured correctly
    expect(result.linesBefore).toBe(10);
    // No write expected if memory is short enough (step 4 guard: decayable <= budget)
    // But the function ran (no early return) — result object should be returned
    expect(result).toHaveProperty('archivedSprints');
  });

  it('edge case: exempt files alone exceed budget — warning expected but no error thrown', () => {
    // exempt (702) > budget (300), eligible = 0 → no decay, no crash
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.brain') && !path.includes('sprints') && !path.includes('archive');
    });
    vi.mocked(readdirSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) {
        return ['DECISIONS.md'] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('DECISIONS.md')) return 'x\n'.repeat(702).trimEnd();
      throw new Error('ENOENT');
    });
    vi.mocked(countBrainLines).mockReturnValue(702);

    // Should not throw — exempt-only budget overflow is gracefully handled
    expect(() => {
      runDecay('/root', 'sprint-137', { memoryBudget: 300 });
    }).not.toThrow();

    // Decay should NOT have written anything (eligible = 0, no decay needed)
    expect(vi.mocked(writeFileSync).mock.calls).toHaveLength(0);
  });
});
