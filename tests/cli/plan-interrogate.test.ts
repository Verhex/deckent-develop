import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Module-level mocks ──────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  constants: { W_OK: 2, R_OK: 4, F_OK: 0 },
}));

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn().mockResolvedValue(''),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({
    language: 'en',
    plan: undefined,
    activeModeConfig: { max_workers: 4 },
  }),
}));

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  readContext: vi.fn().mockReturnValue({
    directives: '', memory: '', retro: '', debt: [],
    patterns: '', decisions: '', existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
  }),
  planSprint: vi.fn().mockReturnValue({
    id: 'sprint-276',
    number: 276,
    tasks: [],
    reasoning: undefined,
    planningMode: undefined,
  }),
  confirmDraftTasks: vi.fn(),
  cleanupDraftTasks: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/cli/helpers/prompt.js', () => ({
  promptConfirm: vi.fn().mockResolvedValue(true),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runInterrogation, registerPlan } from '../../src/cli/commands/plan.js';
import { loadConfig } from '../../src/core/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_DIRECTIVES = `# DIRECTIVES — Sprint 276: PLAN-INT-1

## Goal: Deliver two quality levers (Alperen 2026-06-10).

---

## Task 1: directive-interrogator core
- Model: opus

### Description
Build the interrogator.
`;

function makeRlFactory(answers: string[]): () => {
  question: (q: string) => Promise<string>;
  close: () => void;
} {
  let idx = 0;
  return () => ({
    question: vi.fn().mockImplementation(() => {
      const ans = answers[idx] ?? '';
      idx++;
      return Promise.resolve(ans);
    }),
    close: vi.fn(),
  });
}

// ─── Unit tests: runInterrogation ─────────────────────────────────────────────

describe('runInterrogation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks 5 questions, confirm=true → writes revised draft to disk', async () => {
    const rlFactory = makeRlFactory(['real pain', 'narrow slice', 'none found', 'premise ok', 'simpler']);
    const confirmFn = vi.fn().mockResolvedValue(true);

    const result = await runInterrogation(
      '/project/DIRECTIVES.md',
      SAMPLE_DIRECTIVES,
      'en',
      rlFactory,
      confirmFn,
    );

    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const [writePath, writeContent] = vi.mocked(writeFileSync).mock.calls[0] as [string, string, string];
    expect(writePath).toBe('/project/DIRECTIVES.md');
    expect(writeContent).toContain('Interrogation Refinements');
    expect(writeContent).toContain('real pain');
    expect(result).toContain('Interrogation Refinements');
    expect(confirmFn).toHaveBeenCalledOnce();
  });

  it('confirm=false → writeFileSync NOT called, original content returned', async () => {
    const rlFactory = makeRlFactory(['pain answer', 'wedge answer', 'hidden answer', 'premise answer', 'effort answer']);
    const confirmFn = vi.fn().mockResolvedValue(false);

    const result = await runInterrogation(
      '/project/DIRECTIVES.md',
      SAMPLE_DIRECTIVES,
      'en',
      rlFactory,
      confirmFn,
    );

    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(result).toBe(SAMPLE_DIRECTIVES);
    expect(confirmFn).toHaveBeenCalledOnce();
  });

  it('all empty answers → original returned, confirmFn never called', async () => {
    const rlFactory = makeRlFactory(['', '', '', '', '']);
    const confirmFn = vi.fn();

    const result = await runInterrogation(
      '/project/DIRECTIVES.md',
      SAMPLE_DIRECTIVES,
      'en',
      rlFactory,
      confirmFn,
    );

    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(result).toBe(SAMPLE_DIRECTIVES);
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it('partial answers (some empty) → draft excludes empty answers', async () => {
    const rlFactory = makeRlFactory(['real pain', '', '', 'premise matters', '']);
    const confirmFn = vi.fn().mockResolvedValue(true);

    await runInterrogation(
      '/project/DIRECTIVES.md',
      SAMPLE_DIRECTIVES,
      'en',
      rlFactory,
      confirmFn,
    );

    const [, writeContent] = vi.mocked(writeFileSync).mock.calls[0] as [string, string, string];
    expect(writeContent).toContain('real pain');
    expect(writeContent).toContain('premise matters');
    expect(writeContent).toContain('Interrogation Refinements');
  });

  it('uses i18n lang=tr for question text', async () => {
    const rlFactory = makeRlFactory(['cevap1', 'cevap2', 'cevap3', 'cevap4', 'cevap5']);
    const confirmFn = vi.fn().mockResolvedValue(false);

    // Should not throw with tr lang
    await runInterrogation(
      '/project/DIRECTIVES.md',
      SAMPLE_DIRECTIVES,
      'tr',
      rlFactory,
      confirmFn,
    );
    // If lang=tr works, confirmFn is called (answers are non-empty)
    expect(confirmFn).toHaveBeenCalledOnce();
  });
});

// ─── registerPlan: --interrogate option wiring ────────────────────────────────

describe('registerPlan --interrogate option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers --interrogate option in the plan command', () => {
    const program = new Command();
    registerPlan(program);
    const planCmd = program.commands.find((c) => c.name() === 'plan');
    expect(planCmd).toBeDefined();
    const hasInterrogate = planCmd!.options.some((o) => o.long === '--interrogate');
    expect(hasInterrogate).toBe(true);
  });

  it('--no-confirm skips interrogation even when --interrogate is set', async () => {
    // --no-confirm (opts.confirm=false) → existsSync never reached for interrogation
    vi.mocked(loadConfig).mockResolvedValue({
      language: 'en',
      plan: { interrogate: true },
      activeModeConfig: { max_workers: 4 },
    } as never);

    const program = new Command();
    program.exitOverride();
    registerPlan(program);

    await program.parseAsync(['node', 'test', 'plan', '--no-confirm']).catch(() => {});

    // existsSync should NOT be called for the interrogation path
    // (it might be called for other things, but writeFileSync must not be called
    //  with DIRECTIVES.md content)
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('config.plan.interrogate=true triggers interrogation without --interrogate flag', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      language: 'en',
      plan: { interrogate: true },
      activeModeConfig: { max_workers: 4 },
    } as never);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_DIRECTIVES);

    const program = new Command();
    program.exitOverride();
    registerPlan(program);

    // Use --no-confirm to avoid the approval prompt blocking, but we want to test
    // that the interrogation check fires. Since --no-confirm also skips interrogation,
    // let's use a readline mock that returns empty answers (safe path).
    // To actually test config trigger without --no-confirm, we need the readline mock.
    // The readline mock at module level returns '' for all answers.
    // With empty answers runInterrogation returns early → no write.
    // The key assertion: existsSync WAS called (interrogation code was reached).
    // Reset existsSync counter then run without --no-confirm:
    vi.mocked(existsSync).mockClear();
    vi.mocked(existsSync).mockReturnValue(true);

    // Re-run with --structured + empty readline responses (won't block)
    await program.parseAsync(['node', 'test', 'plan', '--structured']).catch(() => {});

    // existsSync should have been called for DIRECTIVES.md interrogation check
    expect(vi.mocked(existsSync)).toHaveBeenCalledWith('/project/DIRECTIVES.md');
  });
});
