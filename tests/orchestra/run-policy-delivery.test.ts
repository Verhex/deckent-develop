import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveRunPolicyFromDirectives,
  RUN_POLICY_DIRECTIVES_SECTION,
  RUN_POLICY_DIRECTIVES_SOURCE_REF,
} from '../../src/orchestra/run-policy-resolver.js';
import { buildRunPolicyAuthorityBlock } from '../../src/orchestra/prompt-god-template.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { gateRunPolicyParityVerdict } from '../../src/orchestra/result-evaluator.js';
import {
  createRunPolicyPlanAuthority,
  type EvaluationResult,
  type Task,
} from '../../src/core/types.js';
import { DeckentError } from '../../src/core/errors.js';

const DIRECTIVES_WITH_CONTRACT = [
  '# DIRECTIVES — test wave',
  '',
  '## Goal',
  '',
  'Do the thing.',
  '',
  RUN_POLICY_DIRECTIVES_SECTION,
  '',
  '- No build or repository-wide test run during the sprint.',
  '- Effective concurrency is one; no parallel writer or',
  '  parallel full-tree verification.',
  '',
  '## Tasks',
  '',
  '- Task one',
  '',
].join('\n');

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '7140-001',
    title: 'run policy delivery',
    description: 'carry the digest-bound run policy',
    type: 'code-development',
    status: 'EXECUTING',
    priority: 'HIGH',
    model: 'gpt-5.6-sol',
    effort: 'high',
    dependencies: [],
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/run-policy-resolver.ts'],
    },
    goNogo: { goCriteria: 'delivered', noGoCriteria: 'unwired', techDebtAcceptable: '' },
    sprintId: 'sprint-7140',
    assignedAgent: 'implementer',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

function extractPolicyBlock(prompt: string): string {
  const start = prompt.indexOf('## Run Execution Policy (digest-bound)');
  expect(start).toBeGreaterThan(-1);
  const rest = prompt.slice(start);
  const end = rest.indexOf('\n## ', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('resolveRunPolicyFromDirectives — plan-time producer', () => {
  it('resolves the Execution Contract section into a digest-bound authority (wrapped bullets joined)', () => {
    const authority = resolveRunPolicyFromDirectives(DIRECTIVES_WITH_CONTRACT);
    expect(authority).toBeDefined();
    expect(authority!.version).toBe(1);
    expect(authority!.sourceRef).toBe(RUN_POLICY_DIRECTIVES_SOURCE_REF);
    expect(authority!.constraints).toEqual([
      'No build or repository-wide test run during the sprint.',
      'Effective concurrency is one; no parallel writer or parallel full-tree verification.',
    ]);
    expect(authority!.policyDigest).toBe(
      createRunPolicyPlanAuthority({
        constraints: authority!.constraints,
        sourceRef: RUN_POLICY_DIRECTIVES_SOURCE_REF,
      }).policyDigest,
    );
  });

  it('returns undefined when no DIRECTIVES or no contract section exists (explicit absence)', () => {
    expect(resolveRunPolicyFromDirectives(undefined)).toBeUndefined();
    expect(resolveRunPolicyFromDirectives('')).toBeUndefined();
    expect(resolveRunPolicyFromDirectives('# DIRECTIVES\n\n## Goal\n\n- x\n')).toBeUndefined();
  });

  it('fail-closed: a declared section without bullets can never silently resolve empty', () => {
    const declaredButEmpty = `# D\n\n${RUN_POLICY_DIRECTIVES_SECTION}\n\nprose only, no bullets\n\n## Tasks\n- t\n`;
    expect(() => resolveRunPolicyFromDirectives(declaredButEmpty)).toThrow(DeckentError);
    try {
      resolveRunPolicyFromDirectives(declaredButEmpty);
    } catch (error) {
      expect((error as DeckentError).code).toBe('E_RUN_POLICY_SECTION_EMPTY');
    }
  });
});

describe('task-carried compile chain — provider-neutral, FIX-inherited, audited', () => {
  let projectRoot: string;
  const runPolicy = resolveRunPolicyFromDirectives(DIRECTIVES_WITH_CONTRACT)!;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-run-policy-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('renders the digest-bound block from the task itself and instructs the digest echo', () => {
    const task = makeTask({ runPolicy });
    const prompt = buildWorkerPrompt(task, 'AGENT', [], projectRoot);
    const block = extractPolicyBlock(prompt);
    expect(block).toContain(`Policy digest: sha256:${runPolicy.policyDigest}`);
    expect(block).toContain('No build or repository-wide test run during the sprint.');
    expect(block).toContain(`"observedPolicyDigest": "${runPolicy.policyDigest}"`);
    expect(block).toContain('"observedBy": "worker"');
  });

  it('renders NO policy block when the task carries no authority (explicit absence, no silent empty)', () => {
    const prompt = buildWorkerPrompt(makeTask(), 'AGENT', [], projectRoot);
    expect(prompt).not.toContain('## Run Execution Policy (digest-bound)');
  });

  it('provider-parity: Codex/Fable/Qwen-shaped tasks compile a byte-identical policy block', () => {
    const variants: Array<Partial<Task>> = [
      { provider: 'codex', model: 'gpt-5.6-sol' },
      { provider: 'claude', model: 'claude-fable-5' },
      { provider: 'local-llm', model: 'Qwen3.8-27B' },
    ];
    const blocks = variants.map(v =>
      extractPolicyBlock(buildWorkerPrompt(makeTask({ ...v, runPolicy }), 'AGENT', [], projectRoot)),
    );
    expect(blocks[1]).toBe(blocks[0]);
    expect(blocks[2]).toBe(blocks[0]);
    // The renderer's exact byte output is embedded unchanged in every variant.
    expect(blocks[0]).toContain(buildRunPolicyAuthorityBlock(runPolicy));
  });

  it('FIX inheritance: an attempt carrying the parent snapshot compiles the identical block', () => {
    const original = makeTask({ runPolicy });
    const fixAttempt = makeTask({
      id: '7140-001-fix1',
      isPriorityFix: true,
      fixForTaskId: original.id,
      runPolicy: original.runPolicy,
    });
    const originalBlock = extractPolicyBlock(buildWorkerPrompt(original, 'AGENT', [], projectRoot));
    const fixBlock = extractPolicyBlock(buildWorkerPrompt(fixAttempt, 'AGENT', [], projectRoot));
    expect(fixBlock).toBe(originalBlock);
  });

  it('writes durable run-policy audit evidence to the existing execution-authority jsonl', () => {
    const task = makeTask({ runPolicy });
    buildWorkerPrompt(task, 'AGENT', [], projectRoot);
    const auditPath = join(projectRoot, '.deckent', 'runtime', 'prompt-authority', 'execution-authority.jsonl');
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    const entry = lines.find(l => l.kind === 'run-policy-authority');
    expect(entry).toMatchObject({
      schemaVersion: 1,
      kind: 'run-policy-authority',
      taskId: task.id,
      policyDigest: runPolicy.policyDigest,
      constraintCount: runPolicy.constraints.length,
      sourceRef: RUN_POLICY_DIRECTIVES_SOURCE_REF,
    });
  });
});

describe('gateRunPolicyParityVerdict — evaluator consumer', () => {
  const runPolicy = createRunPolicyPlanAuthority({ constraints: ['no build'], sourceRef: 'x' });

  function doneCandidate(): EvaluationResult {
    return { decision: 'DONE', totalScore: 95, rubricScores: [], retryCount: 0 };
  }

  it('passes a policy-free task through untouched', () => {
    const verdict = gateRunPolicyParityVerdict(doneCandidate(), makeTask(), undefined);
    expect(verdict.decision).toBe('DONE');
    expect(verdict.rubricScores).toEqual([]);
  });

  it('downgrades DONE to typed NO_GO when the digest echo is missing', () => {
    const verdict = gateRunPolicyParityVerdict(doneCandidate(), makeTask({ runPolicy }), undefined);
    expect(verdict.decision).toBe('NO_GO');
    expect(verdict.rubricScores.at(-1)).toMatchObject({
      criterion: 'run_policy_parity',
      passed: false,
      reason: 'HOLD:missing-worker-policy-evidence',
    });
  });

  it('downgrades DONE to typed NO_GO on digest mismatch', () => {
    const verdict = gateRunPolicyParityVerdict(doneCandidate(), makeTask({ runPolicy }), {
      version: 1,
      observedPolicyDigest: 'b'.repeat(64),
      observedBy: 'worker',
    });
    expect(verdict.decision).toBe('NO_GO');
    expect(verdict.rubricScores.at(-1)).toMatchObject({ reason: 'HOLD:policy-digest-mismatch' });
  });

  it('keeps DONE and records a passing parity score on exact match', () => {
    const verdict = gateRunPolicyParityVerdict(doneCandidate(), makeTask({ runPolicy }), {
      version: 1,
      observedPolicyDigest: runPolicy.policyDigest,
      observedBy: 'worker',
    });
    expect(verdict.decision).toBe('DONE');
    expect(verdict.rubricScores.at(-1)).toMatchObject({ criterion: 'run_policy_parity', passed: true });
  });
});
