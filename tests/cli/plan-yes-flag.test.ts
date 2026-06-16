/**
 * PLAN-W1 Bug 2 — `deckent plan --yes` non-interactive auto-approve.
 *
 * Without `--yes`, `deckent plan` plans tasks as DRAFT and then blocks on an
 * interactive `promptConfirm('Approve this plan?')`. In a non-interactive
 * context (CI, pipe, MCP) that confirm gets EOF → returns false → the DRAFT
 * tasks are NEVER transitioned to PENDING (`confirmDraftTasks` is skipped), so
 * `deckent start` finds nothing runnable.
 *
 * The fix: `--yes` (alias `-y`) skips the interactive confirm and approves the
 * DRAFT tasks directly (DRAFT → PENDING via `confirmDraftTasks`), so the
 * lifecycle completes without a human at the keyboard.
 *
 * Hermetic: fs / readline / config / brain / prompt all mocked, no disk I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Module-level mocks ──────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
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
  planSprint: vi.fn().mockResolvedValue({
    id: 'sprint-291',
    number: 291,
    tasks: [{ id: '291-001', title: 'T', model: 'sonnet', priority: 'NORMAL', status: 'DRAFT' }],
    reasoning: undefined,
    planningMode: 'structured',
  }),
  confirmDraftTasks: vi.fn().mockResolvedValue(undefined),
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
  promptConfirm: vi.fn().mockResolvedValue(false), // simulate non-interactive EOF → false
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import { registerPlan } from '../../src/cli/commands/plan.js';
import { confirmDraftTasks, planSprint } from '../../src/orchestra/brain.js';
import { promptConfirm } from '../../src/cli/helpers/prompt.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('PLAN-W1 Bug 2 — deckent plan --yes auto-approves (PENDING, not DRAFT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a --yes option', () => {
    const program = new Command();
    registerPlan(program);
    const planCmd = program.commands.find((c) => c.name() === 'plan');
    expect(planCmd).toBeDefined();
    const hasYes = planCmd!.options.some((o) => o.long === '--yes');
    expect(hasYes).toBe(true);
  });

  it('--yes approves DRAFT tasks without prompting → confirmDraftTasks called, promptConfirm NOT', async () => {
    const program = new Command();
    program.exitOverride();
    registerPlan(program);

    await program.parseAsync(['node', 'test', 'plan', '--yes']).catch(() => {});

    // planSprint must have planned as DRAFT (asDraft true) so the lifecycle runs…
    expect(vi.mocked(planSprint)).toHaveBeenCalledOnce();
    const planArgs = vi.mocked(planSprint).mock.calls[0]!;
    const planOpts = planArgs[planArgs.length - 1] as { asDraft?: boolean };
    expect(planOpts.asDraft).toBe(true);

    // …then auto-approved (DRAFT → PENDING) WITHOUT the interactive confirm.
    expect(vi.mocked(confirmDraftTasks)).toHaveBeenCalledOnce();
    expect(vi.mocked(promptConfirm)).not.toHaveBeenCalled();
  });

  it('without --yes, the interactive confirm still gates approval (regression baseline)', async () => {
    const program = new Command();
    program.exitOverride();
    registerPlan(program);

    await program.parseAsync(['node', 'test', 'plan']).catch(() => {});

    // promptConfirm is the gate; mocked to false (EOF) → confirmDraftTasks NOT called.
    expect(vi.mocked(promptConfirm)).toHaveBeenCalledOnce();
    expect(vi.mocked(confirmDraftTasks)).not.toHaveBeenCalled();
  });
});
