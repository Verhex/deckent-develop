// ═══ Result Assembler Tests — git-authoritative, orchestrator-owned ══════════
// Worker Output Contract (spec §1.1/§1.2/§1.5), Plan PHASE 1 / Task 1.2.
// Faithful + hermetic: real git in os.tmpdir() proves files/lines are GIT-derived
// (not worker-claimed); the conflict + validation paths use injected providers.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  assembleResult,
  assembleCanonicalIngressResult,
  computeBoundaryViolations,
  makeStaticGitChangeProvider,
  createDefaultGitChangeProvider,
  AssemblerError,
  type AssembleInput,
  type FileChange,
} from '../../src/orchestra/result-assembler.js';
import { validateTaskResult } from '../../src/core/task-result-schema.js';
import {
  buildPromptDeliveryReceipt,
  promptDeliveryReceiptPath,
  writePromptDeliveryReceipt,
} from '../../src/core/prompt-delivery-receipt.js';
import type { TokenUsage } from '../../src/core/token-usage.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskScope } from '../../src/core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTempDir(prefix = 'result-assembler-test'): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function git(dir: string, cmd: string): void {
  execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' });
}

function initRepo(dir: string): void {
  git(dir, 'init -q');
  git(dir, 'config user.email "test@test.com"');
  git(dir, 'config user.name "Test"');
  git(dir, 'commit --allow-empty -q -m init');
}

function makeScope(overrides: Partial<TaskScope> = {}): TaskScope {
  return {
    directories: ['src/orchestra/'],
    filesRead: [],
    filesWrite: ['src/orchestra/foo.ts'],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test',
    description: '',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: makeScope(),
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-326',
    ...overrides,
  } as Task;
}

const TOKENS: TokenUsage = {
  inputTokens: 1200,
  outputTokens: 800,
  cacheReadTokens: 100,
  cacheCreationTokens: 50,
  totalTokens: 2000,
  source: 'provider-adapter',
};

const COST = { usd: 0.42, pricingSource: 'test-pricing', isLocal: false };

const TIMING = {
  spawnedAt: '2026-06-26T10:00:00.000Z',
  startedAt: '2026-06-26T10:00:01.000Z',
  completedAt: '2026-06-26T10:00:05.000Z',
};

function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    projectRoot: '/tmp/none',
    task: makeTask(),
    identity: { workerId: 'w-1', provider: 'claude', model: 'opus' },
    workerSubjective: {
      selfAssessment: 'DONE',
      notes: 'ok',
      goCriteria: [{ id: 'g1', description: 'tsc clean', met: true }],
      tests: { passed: 5, failed: 0, total: 5 },
      tsc: { clean: true, errors: 0 },
    },
    tokenUsage: TOKENS,
    cost: COST,
    timing: TIMING,
    gitProvider: makeStaticGitChangeProvider([]),
    ...overrides,
  };
}

// ─── 1. git-authoritative file/line derivation (the headline faithful test) ────

describe('assembleResult — git-authoritative work output', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir();
    initRepo(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('derives filesChanged/lines from a real git repo (NOT worker-claimed), 3-line new file → linesAdded===3', async () => {
    mkdirSync(join(dir, 'src/orchestra'), { recursive: true });
    writeFileSync(join(dir, 'src/orchestra/foo.ts'), 'a\nb\nc\n'); // 3 lines, untracked

    const result = await assembleResult(
      baseInput({ projectRoot: dir, gitProvider: undefined }), // real git provider
    );

    const foo = result.filesChanged.find(f => f.path === 'src/orchestra/foo.ts');
    expect(foo).toBeDefined();
    expect(foo!.status).toBe('added');
    expect(foo!.linesAdded).toBe(3); // git-derived, not the worker's claim
    expect(foo!.linesRemoved).toBe(0);
    expect(result.totalLinesAdded).toBe(3);
    expect(result.diskVerified).toBe(true);
    expect(result.boundaryViolations).toEqual([]);

    // injected authoritative resource accounting is copied verbatim
    expect(result.tokenUsage.inputTokens).toBe(1200);
    expect(result.tokenUsage.totalTokens).toBe(2000);
    expect(result.cost.usd).toBe(0.42);
    expect(result.cost.currency).toBe('USD'); // schema default applied

    // duration derived from timestamps (completed − spawned = 5000ms)
    expect(result.durationMs).toBe(5000);

    // identity + the assembled result is schema-valid
    expect(result.taskId).toBe('task-1');
    expect(result.workerId).toBe('w-1');
    expect(result.schemaVersion).toBe('1.0');
    expect(validateTaskResult(result).ok).toBe(true);
  });

  it('classifies modified and deleted tracked files by git status', async () => {
    mkdirSync(join(dir, 'src/orchestra'), { recursive: true });
    writeFileSync(join(dir, 'src/orchestra/keep.ts'), 'one\ntwo\n');
    writeFileSync(join(dir, 'src/orchestra/del.ts'), 'gone\n');
    git(dir, 'add -A');
    git(dir, 'commit -q -m base');

    // modify keep.ts, delete del.ts in the working tree
    writeFileSync(join(dir, 'src/orchestra/keep.ts'), 'one\ntwo\nthree\n');
    rmSync(join(dir, 'src/orchestra/del.ts'));

    const result = await assembleResult(
      baseInput({
        projectRoot: dir,
        gitProvider: undefined,
        task: makeTask({
          scope: makeScope({ filesWrite: ['src/orchestra/keep.ts', 'src/orchestra/del.ts'] }),
        }),
      }),
    );

    const keep = result.filesChanged.find(f => f.path === 'src/orchestra/keep.ts');
    const del = result.filesChanged.find(f => f.path === 'src/orchestra/del.ts');
    expect(keep?.status).toBe('modified');
    expect(keep?.linesAdded).toBe(1);
    expect(del?.status).toBe('deleted');
    expect(del?.linesRemoved).toBe(1);
    expect(result.boundaryViolations).toEqual([]);
  });

  it('flags out-of-scope changed files as boundary violations', async () => {
    mkdirSync(join(dir, 'src/other'), { recursive: true });
    writeFileSync(join(dir, 'src/other/leak.ts'), 'leak\n'); // outside scope

    const result = await assembleResult(
      baseInput({ projectRoot: dir, gitProvider: undefined }),
    );

    expect(result.boundaryViolations.map(v => v.path)).toContain('src/other/leak.ts');
    expect(result.diskVerified).toBe(true);
  });

  it('fails open on a non-git directory → diskVerified:false, no fabricated changes', async () => {
    const nonRepo = makeTempDir('not-a-repo');
    try {
      const result = await assembleResult(
        baseInput({ projectRoot: nonRepo, gitProvider: undefined }),
      );
      expect(result.diskVerified).toBe(false);
      expect(result.filesChanged).toEqual([]);
      expect(result.totalLinesAdded).toBe(0);
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});

// ─── 2. Conflict rule §1.5 (authoritative wins, claim preserved) ───────────────

describe('assembleResult — honestGate conflict (§1.5)', () => {
  it('claimed DONE while tsc dirty → honestGate.flagged, violation=claimed-done-tsc-fail', async () => {
    const result = await assembleResult(
      baseInput({
        workerSubjective: {
          selfAssessment: 'DONE',
          notes: 'all good',
          goCriteria: [],
          tests: { passed: 1, failed: 0, total: 1 },
          tsc: { clean: false, errors: 4 },
        },
      }),
    );
    expect(result.honestGate.flagged).toBe(true);
    expect(result.honestGate.violation).toBe('claimed-done-tsc-fail');
    // the worker claim is preserved verbatim, not silently overwritten
    expect(result.selfAssessment).toBe('DONE');
    expect(result.tsc.clean).toBe(false);
  });

  it('does NOT flag when tsc is clean, or when the worker did not claim DONE', async () => {
    const clean = await assembleResult(baseInput());
    expect(clean.honestGate.flagged).toBe(false);
    expect(clean.honestGate.violation).toBeNull();

    const honestNoGo = await assembleResult(
      baseInput({
        workerSubjective: {
          selfAssessment: 'NO_GO',
          notes: 'tsc failed, reporting honestly',
          goCriteria: [],
          tests: { passed: 0, failed: 1, total: 1 },
          tsc: { clean: false, errors: 2 },
        },
      }),
    );
    expect(honestNoGo.honestGate.flagged).toBe(false);
  });
});

// ─── 3. Validation + error contract ────────────────────────────────────────────

describe('assembleResult — validation', () => {
  it('normalizes legacy ingress into strict canonical V1 once', () => {
    const result = assembleCanonicalIngressResult({
      taskId: 'task-1',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: ['src/orchestra/foo.ts'],
      linesAdded: 2,
      linesRemoved: 0,
    }, { taskId: 'task-1', workerId: 'docker-task-1', provider: 'claude', model: 'opus' });
    expect(validateTaskResult(result).ok).toBe(true);
    expect(result).toMatchObject({ schemaVersion: '1.0', totalLinesAdded: 2 });
    expect(result.tests.outcome).toBe('PASSED');
  });

  it('preserves the host-authored xverify terminal projection through strict settlement', () => {
    // Live regression 2026-08-24: the cutover dropped this additive field and
    // every cross-provider verifier run degraded to framing-invalid.
    const result = assembleCanonicalIngressResult({
      taskId: 'xv-1',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      notes: 'Host-observed terminal xverify protocol completed.\nXVERIFY_RESPONSE_JSON: {}\nVERDICT: CONFIRMED ok',
      hostTerminalProjection: {
        version: 1,
        protocol: 'xverify-v1',
        observedBy: 'host',
        sourceMarker: { type: 'EXIT_WITHOUT_RESULT', exitCode: 0 },
      },
    }, { taskId: 'xv-1', workerId: 'docker-xv-1', provider: 'claude', model: 'opus' });
    expect(validateTaskResult(result).ok).toBe(true);
    expect(result.hostTerminalProjection).toMatchObject({
      version: 1,
      protocol: 'xverify-v1',
      observedBy: 'host',
    });
  });

  it('preserves digest-bound evaluator fields through strict canonical settlement', () => {
    const promptCompilePlanId = `prompt-compile-plan:sha256:${'a'.repeat(64)}`;
    const command = 'npx vitest run tests/orchestra/result-assembler.test.ts';
    const result = assembleCanonicalIngressResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      testVerification: {
        applicability: 'REQUIRED',
        outcome: 'PASSED',
        commands: [command],
      },
      criteriaEvidence: [{ criterionId: 'go-1', outcome: 'MET', evidence: ['test passed'] }],
      techDebtCriterionIds: [],
      promptCompilePlanId,
      filesChanged: [],
    }, {
      taskId: 'task-1',
      workerId: 'docker-task-1',
      provider: 'codex',
      model: 'gpt-test',
      sprintId: 'sprint-661',
      promptCompilePlanId,
      verificationCommands: [command],
      isPriorityFix: true,
      fixForTaskId: 'task-0',
    });

    expect(result).toMatchObject({
      promptCompilePlanId,
      testVerification: { applicability: 'REQUIRED', outcome: 'PASSED', commands: [command] },
      techDebtCriterionIds: [],
      sprintId: 'sprint-661',
      isPriorityFix: true,
      fixForTaskId: 'task-0',
    });
  });
  it('throws AssemblerError when the assembled result is invalid', async () => {
    await expect(
      assembleResult(baseInput({ task: makeTask({ id: '' }) })),
    ).rejects.toBeInstanceOf(AssemblerError);

    try {
      await assembleResult(baseInput({ task: makeTask({ id: '' }) }));
    } catch (e) {
      expect(e).toBeInstanceOf(AssemblerError);
      expect((e as AssemblerError).errors.some(msg => msg.startsWith('taskId'))).toBe(true);
    }
  });

  it('embeds the worker-subjective block and leaves brain/auditor slots null', async () => {
    const result = await assembleResult(
      baseInput({
        gitProvider: makeStaticGitChangeProvider([
          { path: 'src/orchestra/foo.ts', status: 'added', linesAdded: 2, linesRemoved: 0 },
        ]),
      }),
    );
    expect(result.notes).toBe('ok');
    expect(result.goCriteria[0]?.id).toBe('g1');
    expect(result.goCriteria[0]?.evidence).toBeNull(); // default applied
    expect(result.tests.passed).toBe(5);
    expect(result.tests.orchestratorVerified).toBe(false);
    expect(result.brainEvaluation).toBeNull();
    expect(result.auditorValidation).toBeNull();
    expect(result.totalLinesAdded).toBe(2);
  });

  it('preserves a false worker claim separately without erasing host-measured work', async () => {
    const result = await assembleResult(baseInput({
      workerSubjective: {
        ...baseInput().workerSubjective,
        workClaim: { filesChanged: [], linesAdded: 0, linesRemoved: 0 },
      },
      gitProvider: makeStaticGitChangeProvider([
        { path: 'src/orchestra/foo.ts', status: 'modified', linesAdded: 3, linesRemoved: 1 },
      ]),
    }));
    expect(result.totalLinesAdded).toBe(3);
    expect(result.filesChanged).toHaveLength(1);
    expect(result.workerWorkClaim).toMatchObject({ mismatch: true, filesChanged: [] });
  });
});

describe('assembleResult — prompt delivery identity authority', () => {
  it('credits only identities rendered into a current receipt', async () => {
    const root = makeTempDir('result-delivery-current');
    try {
      const planId = `prompt-compile-plan:sha256:${'a'.repeat(64)}`;
      const receipt = buildPromptDeliveryReceipt({
        taskId: 'task-1',
        prompt: 'final prompt bytes',
        promptCompilePlanId: planId,
        rolePolicyIdentity: 'worker:delivered-agent',
        assignedAgentId: 'claim-agent',
        assignedSkillIds: ['claim-skill'],
        segments: [
          { kind: 'persona', content: '=== Agent: delivered-agent ===\npersona' },
          { kind: 'skills', content: '=== Skills ===\n--- delivered-skill ---\nbody\n' },
        ],
      });
      expect(writePromptDeliveryReceipt(root, receipt)).toBe(true);
      const result = await assembleResult(baseInput({
        projectRoot: root,
        task: makeTask({ promptCompilePlanId: planId, assignedAgent: 'assigned-agent', assignedSkills: ['assigned-skill'] }),
        identity: { workerId: 'w-1', provider: 'claude', model: 'opus', agent: 'claim-agent', skills: ['claim-skill'] },
      }));
      expect(result.agent).toBe('delivered-agent');
      expect(result.skills).toEqual(['delivered-skill']);
      expect(result.promptDeliveryAttribution).toEqual({ state: 'CURRENT' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('gives no identity credit when a fresh current receipt is absent or malformed', async () => {
    const root = makeTempDir('result-delivery-hold');
    const planId = `prompt-compile-plan:sha256:${'b'.repeat(64)}`;
    const input = baseInput({
      projectRoot: root,
      task: makeTask({ promptCompilePlanId: planId, assignedAgent: 'assigned-agent', assignedSkills: ['assigned-skill'] }),
      identity: { workerId: 'w-1', provider: 'claude', model: 'opus', agent: 'claim-agent', skills: ['claim-skill'] },
    });
    try {
      const missing = await assembleResult(input);
      expect(missing.agent).toBeNull();
      expect(missing.skills).toEqual([]);
      expect(missing.promptDeliveryAttribution).toEqual({ state: 'HOLD', reason: 'missing' });

      mkdirSync(join(root, '.tasks'), { recursive: true });
      writeFileSync(promptDeliveryReceiptPath(root, 'task-1'), '{malformed', 'utf8');
      const malformed = await assembleResult(input);
      expect(malformed.agent).toBeNull();
      expect(malformed.skills).toEqual([]);
      expect(malformed.promptDeliveryAttribution).toEqual({ state: 'HOLD', reason: 'malformed' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── 4. Boundary helper unit coverage ──────────────────────────────────────────

describe('computeBoundaryViolations', () => {
  const changes: FileChange[] = [
    { path: 'src/orchestra/foo.ts', status: 'added', linesAdded: 1, linesRemoved: 0 },
    { path: 'src/secret/leak.ts', status: 'modified', linesAdded: 1, linesRemoved: 0 },
  ];

  it('allows files under scope.directories and in scope.filesWrite, flags the rest', () => {
    const v = computeBoundaryViolations(changes, makeScope());
    expect(v).toEqual([{ path: 'src/secret/leak.ts', reason: 'outside-declared-scope' }]);
  });

  it('matches a directory entry with or without a trailing slash', () => {
    const v = computeBoundaryViolations(changes, makeScope({ directories: ['src/orchestra'] }));
    expect(v.map(x => x.path)).toEqual(['src/secret/leak.ts']);
  });
});

// ─── 5. Static provider seam ────────────────────────────────────────────────────

describe('makeStaticGitChangeProvider', () => {
  it('reports diskVerified=false when ok=false', async () => {
    const result = await assembleResult(
      baseInput({ gitProvider: makeStaticGitChangeProvider([], false) }),
    );
    expect(result.diskVerified).toBe(false);
  });

  it('createDefaultGitChangeProvider is exported and returns a provider', () => {
    const p = createDefaultGitChangeProvider('/tmp/none');
    expect(typeof p.collect).toBe('function');
  });
});
