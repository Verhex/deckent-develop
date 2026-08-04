import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../src/orchestra/brain.js', () => ({
  finalizeSprint: vi.fn().mockResolvedValue({
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    coveragePercent: 100,
    durationMs: 1000,
  }),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  evaluateResultSync: vi.fn().mockReturnValue('DONE'),
}));

// Partial mock: override regenerateRules but keep real CUSTOM_TEMPLATE +
// mergeWithCustom exports so Bug O tests run against actual behavior.
vi.mock('../../src/core/rule-generator.js', async (importActual) => {
  const actual = await importActual<typeof import('../../src/core/rule-generator.js')>();
  return {
    ...actual,
    regenerateRules: vi.fn().mockResolvedValue({
      filesWritten: ['.claude/rules/brain.md'],
      filesSkipped: [],
      errors: [],
    }),
  };
});

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

vi.mock('../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn().mockReturnValue('ok'),
}));

vi.mock('../../src/cli/commands/review.js', () => ({
  loadReviewState: vi.fn().mockReturnValue(null),
}));

// FAZ4B: the non-force finalize path proves coordinator death via the sprint
// recovery operation before terminal publication — inert typed no-ops here.
vi.mock('../../src/orchestra/sprint-recovery-operation.js', () => ({
  containSprintRecoveryCoordinator: vi.fn().mockResolvedValue({ action: 'none' }),
  readSprintRecoverySettlementIdentity: vi.fn().mockReturnValue({ generation: 1, fenceToken: 'fence-1' }),
  runSprintRecoveryOperation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/utils.js', async (importActual) => ({
  // Partial mock: readJsonSafe is the seam; debugLog & friends stay real.
  ...(await importActual<Record<string, unknown>>()),
  readJsonSafe: vi.fn((path: string) => {
    if (path.endsWith('.json')) {
      return {
        id: '001-001',
        title: 'demo',
        sprintId: 'sprint-166',
        status: 'DONE',
        scope: { directories: [], filesRead: [], filesWrite: [] },
      };
    }
    if (path.endsWith('.result')) {
      return {
        taskId: '001-001',
        filesChanged: ['x.ts'],
        testsPassed: true,
        selfAssessment: 'DONE',
      };
    }
    return null;
  }),
}));

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      // Sprint not already finalized → no existing sprint log file
      if (typeof path === 'string' && path.includes('/sprints/')) return false;
      return true;
    }),
    readdirSync: vi.fn(() => ['task-001-001.json', 'task-001-001.result']),
    // buildSprintFromTasks reads canonical task records via readFileSync +
    // classifyTaskArtifact (filename/id must agree); everything else falls
    // through to the real fs.
    readFileSync: vi.fn((path: unknown, ...rest: unknown[]) => {
      if (typeof path === 'string' && path.endsWith('task-001-001.json')) {
        return JSON.stringify({
          id: '001-001',
          title: 'demo',
          sprintId: 'sprint-166',
          status: 'DONE',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        });
      }
      return (actual.readFileSync as (...args: unknown[]) => unknown)(path, ...rest);
    }),
  };
});

// ─── Static Imports ──────────────────────────────────────────────────

import { finalizeSprint } from '../../src/orchestra/brain.js';
import {
  regenerateRules,
  CUSTOM_TEMPLATE,
  mergeWithCustom,
} from '../../src/core/rule-generator.js';
import { registerFinalize } from '../../src/cli/commands/finalize.js';

// ─── Helper ─────────────────────────────────────────────────────────

async function runFinalizeAction(): Promise<void> {
  const program = new Command();
  registerFinalize(program);
  await program.parseAsync(['node', 'deckent', 'finalize']);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('finalize command — Bug N (onRuleRegen wire)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes onRuleRegen callback to finalizeSprint', async () => {
    await runFinalizeAction();

    expect(finalizeSprint).toHaveBeenCalledOnce();
    const callArgs = (finalizeSprint as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const options = callArgs[4] as { onRuleRegen?: (root: string) => Promise<void> };
    expect(options).toBeDefined();
    expect(options.onRuleRegen).toBeTypeOf('function');
  });

  it('invokes regenerateRules when onRuleRegen callback fires', async () => {
    await runFinalizeAction();

    const callArgs = (finalizeSprint as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const options = callArgs[4] as { onRuleRegen: (root: string) => Promise<void> };

    // Simulate sprint-finalizer invoking the callback from postFinalizeHooks Step 3
    await options.onRuleRegen('/project');

    expect(regenerateRules).toHaveBeenCalledOnce();
    expect(regenerateRules).toHaveBeenCalledWith('/project');
  });
});

describe('rule-generator — Bug O (CUSTOM_TEMPLATE empty block)', () => {
  it('CUSTOM_TEMPLATE is an empty placeholder, not a copy of AUTO content', () => {
    expect(CUSTOM_TEMPLATE).toBe('\n');
    expect(CUSTOM_TEMPLATE).not.toContain('AUTO-START');
    expect(CUSTOM_TEMPLATE).not.toContain('AUTO-END');
    expect(CUSTOM_TEMPLATE.trim()).toBe('');
  });

  it('mergeWithCustom regeneration is idempotent (Sprint 166 idempotency gate)', () => {
    const autoContent = '# Brain Rules\n- Rule 1\n- Rule 2\n';

    const first = mergeWithCustom(autoContent, null);
    const second = mergeWithCustom(autoContent, first);

    // Idempotency: same auto + previous output → identical content
    expect(second).toBe(first);

    // Each marker appears exactly once — no duplication on regen
    expect((second.match(/<!-- AUTO-START -->/g) ?? []).length).toBe(1);
    expect((second.match(/<!-- AUTO-END -->/g) ?? []).length).toBe(1);
    expect((second.match(/<!-- CUSTOM-START -->/g) ?? []).length).toBe(1);
    expect((second.match(/<!-- CUSTOM-END -->/g) ?? []).length).toBe(1);
  });
});
