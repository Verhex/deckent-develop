import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const state = vi.hoisted(() => ({
  code: 'PLANNER_EVIDENCE_HOLD',
  language: 'en',
  hostile: 'SECRET planner receipt /private/path',
}));

function refusalError(): Error & { code: string } {
  return Object.assign(new Error(state.hostile), { code: state.code });
}

vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  loadConfig: vi.fn(async () => ({
    language: state.language,
    projectName: 'fixture',
    projectRoot: '/fixture',
    terminal: { run_flow_v2: true },
    activeModeConfig: { max_workers: 1, brain_model: 'gpt-5.6-sol', default_model: 'gpt-5.6-sol' },
  })),
  readAuthMode: vi.fn(async () => 'subscription'),
  resolveBrainModel: vi.fn(() => 'gpt-5.6-sol'),
  resolveBrainPlanningMode: vi.fn(() => 'structured'),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/provider.js')>()),
  bootstrapProviders: vi.fn(async () => ({ registered: [], skipped: [], defaultProvider: null })),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(() => ({
    directives: 'Plan fixture', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  })),
  planSprint: vi.fn(),
  runSprint: vi.fn(),
  BrainError: class BrainError extends Error {},
}));

vi.mock('../../src/orchestra/run-flow-plan-service.js', () => ({
  planRunFlow: vi.fn(async () => { throw refusalError(); }),
  decideRunFlowPlan: vi.fn(),
  RunFlowPlanServiceError: class RunFlowPlanServiceError extends Error {},
}));

vi.mock('../../src/orchestra/run-job-service.js', () => ({
  startApprovedRun: vi.fn(() => { throw refusalError(); }),
  RunJobFlowNotApprovedError: class RunJobFlowNotApprovedError extends Error {},
  RunJobDigestMismatchError: class RunJobDigestMismatchError extends Error {},
}));

vi.mock('../../src/core/run-flow-store.js', () => ({
  loadApprovedSnapshot: vi.fn(() => undefined),
  loadStartAttempt: vi.fn(() => undefined),
  listFlowIds: vi.fn(() => []),
  loadRunHandle: vi.fn(() => undefined),
}));

vi.mock('../../src/core/approval-authority-bootstrap.js', () => ({
  bootstrapApprovalAuthority: vi.fn(() => ({ state: 'disabled' })),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/fixture'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn(() => ''),
  formatSprintSummary: vi.fn(() => ''),
}));

vi.mock('../../src/cli/commands/chat-spinner.js', () => ({
  createSpinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

import { printError } from '../../src/cli/helpers/output.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { registerPlan } from '../../src/cli/commands/plan.js';
import { registerStart } from '../../src/cli/commands/start.js';
import { planRunFlow } from '../../src/orchestra/run-flow-plan-service.js';
import { startApprovedRun } from '../../src/orchestra/run-job-service.js';

type RefusalCode =
  | 'PLANNER_EVIDENCE_HOLD'
  | 'PLANNER_EVIDENCE_REPLAN_REQUIRED'
  | 'EXACT_START_PLANNER_EVIDENCE_HOLD'
  | 'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED';

const CODES: readonly RefusalCode[] = [
  'PLANNER_EVIDENCE_HOLD',
  'PLANNER_EVIDENCE_REPLAN_REQUIRED',
  'EXACT_START_PLANNER_EVIDENCE_HOLD',
  'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED',
];

function printedError(): string {
  const value = vi.mocked(printError).mock.calls.at(-1)?.[0];
  return value instanceof Error ? value.message : String(value);
}

async function runRegistered(command: 'plan' | 'start'): Promise<void> {
  const program = new Command().exitOverride();
  if (command === 'plan') registerPlan(program);
  else registerStart(program);
  const args = command === 'plan'
    ? ['plan', '--structured', '--no-confirm']
    : [
        'start', '--flow-id', 'flow-1', '--revision', '1', '--plan-digest', 'digest-1',
        '--exact-attempt-id', 'attempt-1', '--exact-owner-nonce', 'nonce-1',
        '--exact-log-ref', '/fixture/log',
      ];
  try {
    await program.parseAsync(['node', 'fixture', ...args]);
  } catch {
    // Commander exitOverride is deliberately contained by the adapter test.
  }
}

describe('registered CLI planner-evidence refusal adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  for (const command of ['plan', 'start'] as const) {
    for (const language of ['en', 'tr'] as const) {
      it.each(CODES)(`${command} ${language} renders %s without raw evidence`, async (code) => {
        state.code = code;
        state.language = language;

        await runRegistered(command);

        expect(process.exitCode).toBe(1);
        expect(printedError()).toContain(code);
        expect(printedError()).not.toContain(state.hostile);
        expect(printedError()).toContain(getMessage(
          code.includes('REPLAN')
            ? 'planner_evidence.next.replan'
            : 'planner_evidence.next.inspect_evidence',
          language,
        ));
        expect(command === 'plan' ? planRunFlow : startApprovedRun).toHaveBeenCalledTimes(1);
      });
    }
  }

  it('preserves the pre-existing unknown-error presentation', async () => {
    state.code = 'UNKNOWN_DOMAIN_CODE';
    state.language = 'en';

    await runRegistered('plan');

    expect(printedError()).toBe(state.hostile);
  });
});
