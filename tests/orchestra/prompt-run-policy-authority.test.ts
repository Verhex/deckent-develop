import { describe, expect, it } from 'vitest';

import type { Task } from '../../src/core/task-types.js';
import { TaskStatus, RUN_POLICY_AUTHORITY_VERSION } from '../../src/core/task-types.js';
import {
  buildRunPolicyAuthorityBlock,
  buildTaskPrompt,
  buildTaskPromptSegmented,
  type RunPolicyAuthority,
} from '../../src/orchestra/prompt-god-template.js';

const POLICY_DIGEST = 'f'.repeat(64);

function runPolicy(overrides: Partial<RunPolicyAuthority> = {}): RunPolicyAuthority {
  return {
    version: RUN_POLICY_AUTHORITY_VERSION,
    policyDigest: POLICY_DIGEST,
    constraints: [
      'No build or repository-wide/full-suite test is allowed.',
      'Maximum concurrent dispatch is the effective-config value; never fabricate capacity.',
      'Workers may modify only Files: paths — Scope: grants bounded discovery, not write authority.',
    ],
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '3199-017',
    title: 'Run-wide prompt policy propagation',
    description: 'Bind the approved run-wide execution constraints into every prompt.',
    model: 'test-model',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'regression',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'run policy bound', noGoCriteria: 'policy dropped', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

describe('486-017 run-wide prompt policy propagation', () => {
  it('omits the block entirely when no run policy authority is supplied', () => {
    const prompt = buildTaskPrompt(task(), {}).prompt;
    expect(prompt).not.toContain('## Run Execution Policy');
  });

  it('renders the digest, bounded constraints and override-precedence instruction', () => {
    const authority = runPolicy();
    // RUN-POLICY-DELIVERY-001: the authority is TASK-CARRIED (487-026 pattern);
    // the retired ctx-injection field no longer exists.
    const prompt = buildTaskPrompt(task({ runPolicy: authority }), {}).prompt;

    expect(prompt).toContain('## Run Execution Policy (digest-bound)');
    expect(prompt).toContain(`Policy digest: sha256:${POLICY_DIGEST}`);
    expect(prompt).toContain('No build or repository-wide/full-suite test is allowed.');
    expect(prompt).toContain('every original and FIX attempt in this run');
    expect(prompt).toContain('never authorize a build, a repository-wide/full-suite test run');
    expect(prompt).toContain('can never override or contradict a constraint listed here');
  });

  it('never reproduces raw DIRECTIVES bytes — only the caller-supplied bounded summaries', () => {
    const authority = runPolicy({ sourceRef: 'DIRECTIVES.md#Execution Contract' });
    const prompt = buildTaskPrompt(task({ runPolicy: authority }), {}).prompt;

    expect(prompt).toContain('Source: DIRECTIVES.md#Execution Contract (addressed by digest above, not reproduced verbatim).');
    // The raw sprint-goal prose from DIRECTIVES.md must never leak into the prompt.
    expect(prompt).not.toContain('Runtime Truth Wiring');
  });

  it('caps the rendered constraint count and honestly notes the omission — never an unbounded dump', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Constraint number ${i}.`);
    const block = buildRunPolicyAuthorityBlock(runPolicy({ constraints: many }));

    const renderedLines = block.split('\n').filter(l => l.startsWith('- Constraint number'));
    expect(renderedLines.length).toBe(25);
    expect(block).toContain(`(+15 more constraint(s) omitted here — verify the full set against policy digest sha256:${POLICY_DIGEST}`);
  });

  it('truncates an individual over-long constraint instead of dumping it verbatim', () => {
    const huge = 'x'.repeat(1000);
    const block = buildRunPolicyAuthorityBlock(runPolicy({ constraints: [huge] }));

    expect(block).toContain('x'.repeat(320) + '…');
    expect(block).not.toContain('x'.repeat(321));
  });

  it('is provider-neutral: identical run-policy segment content regardless of provider/model', () => {
    const authority = runPolicy();
    const claudeSegments = buildTaskPromptSegmented(
      task({ provider: 'claude', model: 'claude-sonnet-5', runPolicy: authority }),
      {},
    ).segments;
    const codexSegments = buildTaskPromptSegmented(
      task({ provider: 'codex', model: 'gpt-5.6-sol', runPolicy: authority }),
      {},
    ).segments;

    const claudePolicy = claudeSegments.find(s => s.kind === 'run-policy')?.content;
    const codexPolicy = codexSegments.find(s => s.kind === 'run-policy')?.content;
    expect(claudePolicy).toBeDefined();
    expect(claudePolicy).toBe(codexPolicy);
  });

  it('applies identically to an original task and its FIX attempt (same run policy, no auto-override)', () => {
    const authority = runPolicy();
    const originalPolicy = buildTaskPromptSegmented(task({ id: '3199-017', runPolicy: authority }), {})
      .segments.find(s => s.kind === 'run-policy')?.content;
    const fixPolicy = buildTaskPromptSegmented(
      task({
        id: '3199-017-fix1',
        goNogo: { goCriteria: 'run full build and full test suite', noGoCriteria: '', techDebtAcceptable: '' },
        runPolicy: authority,
      }),
      {},
    ).segments.find(s => s.kind === 'run-policy')?.content;

    expect(fixPolicy).toBeDefined();
    expect(fixPolicy).toBe(originalPolicy);
  });

  it('drops empty/blank constraints and returns an empty block when nothing renderable remains', () => {
    expect(buildRunPolicyAuthorityBlock(runPolicy({ constraints: ['', '   '] }))).toBe('');
    expect(buildRunPolicyAuthorityBlock(undefined)).toBe('');
  });
});
