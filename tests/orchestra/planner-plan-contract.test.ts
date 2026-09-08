import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(), spawn: vi.fn() }));

import type { ProviderAdapter } from '../../src/core/provider.js';
import type { ModelType, PlannerTask } from '../../src/core/types.js';
import { createGoNoGoCriterionItem } from '../../src/core/task-types.js';
import {
  buildZeroConfigPlanPrompt,
  callZeroConfigPlanner,
  normalizePlannerResultForContract,
  type PlannerSpawnFn,
} from '../../src/orchestra/planner.js';
import {
  derivePlannerPlanContract,
  findContradictoryFileCriteria,
  validatePlannerPlanContract,
} from '../../src/orchestra/planner-plan-contract.js';

const MODEL = 'claude-sonnet-5' as ModelType;

describe('criterion presence admission contract', () => {
  const item = (polarity: 'go' | 'no-go', evidenceRequirements: string[]) =>
    createGoNoGoCriterionItem({ polarity, statement: 'Authored condition', evidenceRequirements });

  it('rejects identical opposite any-of domains, independent of ordering and duplicate alternatives', () => {
    const go = item('go', ['file:"README.md"', 'file:"Dockerfile"']);
    const noGo = item('no-go', ['file:"Dockerfile"', 'file:"README.md"', 'file:"README.md"']);
    expect(findContradictoryFileCriteria([go, noGo])).toEqual([{ goId: go.id, noGoId: noGo.id }]);
    expect(findContradictoryFileCriteria([go, item('no-go', ['file:"README.md"'])])).toEqual([]);
  });

  it.each(['assertion:"contents differ"', 'command:"verify"', 'file:{"path":"README.md"}',
    'file:"../README.md"', 'file:"https://example.com/a.md"', 'README.md'])
  ('does not invent presence authority for %s', requirement => {
    expect(findContradictoryFileCriteria([item('go', [requirement]), item('no-go', [requirement])])).toEqual([]);
  });

  it('propagates typed source requirements before execution even with empty inventory', () => {
    const candidate = task('Write result');
    candidate.goNogo.items = [item('go', ['file:"Dockerfile"'])];
    expect(validatePlannerPlanContract({ reasoning: '', tasks: [candidate] }, derivePlannerPlanContract(), []))
      .toContain('scope:CRITERION_EVIDENCE_NOT_READABLE:Dockerfile:slot-1');
  });

  it('repairs the provider-authored contradiction in the existing finite planner retry', async () => {
    const invalid = task('Write result');
    invalid.goNogo.items = [item('go', ['file:"docs/CANARY-RESULT.md"']), item('no-go', ['file:"docs/CANARY-RESULT.md"'])];
    const repaired = task('Write result');
    repaired.goNogo.items = [item('go', ['assertion:"Snapshot is preserved and append is exact"']),
      item('no-go', ['assertion:"Snapshot changed beyond the requested append"'])];
    const prompts: string[] = [];
    const spawnFn: PlannerSpawnFn = async (_command, args) => {
      prompts.push(args.join(' '));
      return { status: 0, signal: null, stdout: JSON.stringify({ reasoning: '',
        tasks: [prompts.length === 1 ? invalid : repaired] }), stderr: '' };
    };
    const result = await callZeroConfigPlanner('Append exactly', MODEL, 'canary', ['docs/CANARY-RESULT.md'],
      adapter(), undefined, spawnFn, undefined, { defaultModel: MODEL, allowedModels: [MODEL] },
      derivePlannerPlanContract());
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('proves ONLY');
    expect(prompts[1]).toContain('criteria:contradictory-file-presence');
    expect(result?.tasks[0]?.goNogo.items?.map(entry => entry.polarity)).toEqual(['go', 'no-go']);
    expect(result?.tasks[0]?.goNogo.items?.every(entry => entry.evidenceRequirements[0]?.startsWith('assertion:'))).toBe(true);
  });
});

function adapter(): ProviderAdapter {
  return {
    name: 'claude',
    supportedModels: [MODEL] as readonly ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('fixture'),
    buildPlannerCommand: (prompt: string, model: ModelType) => ({
      command: 'fixture-planner',
      args: ['--prompt', prompt, '--model', model],
    }),
  } as unknown as ProviderAdapter;
}

function task(title: string, dependencies: string[] = []): PlannerTask {
  return {
    title,
    description: `Update docs/CANARY-RESULT.md for ${title}.`,
    model: MODEL,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'bounded documentation change',
    scope: {
      directories: [],
      filesRead: [],
      filesWrite: ['docs/CANARY-RESULT.md'],
    },
    dependencies,
    goNogo: {
      goCriteria: 'docs/CANARY-RESULT.md contains the requested result.',
      noGoCriteria: 'docs/CANARY-RESULT.md is unchanged.',
      techDebtAcceptable: 'none',
    },
  };
}

describe('planner plan contract — host-derived intent cardinality', () => {
  it('binds one exact allowed write file to one task without consulting worker concurrency', () => {
    const contract = derivePlannerPlanContract({
      mode: 'closed-allowlist',
      filesWrite: ['docs/CANARY-RESULT.md'],
      plannedNewFiles: ['docs/CANARY-RESULT.md'],
    });

    expect(contract.taskCardinality).toEqual({
      min: 1,
      max: 1,
      basis: 'single-exact-write',
    });
    expect(contract.writeScopePolicy?.filesWrite).toEqual(['docs/CANARY-RESULT.md']);
  });

  it('leaves a non-atomic intent at the host default 1–5 range', () => {
    expect(derivePlannerPlanContract().taskCardinality).toEqual({
      min: 1,
      max: 5,
      basis: 'intent-decomposition',
    });
  });

  it('renders an atomic prompt without forcing a redundant integration writer', () => {
    const contract = derivePlannerPlanContract({
      mode: 'closed-allowlist',
      filesWrite: ['docs/CANARY-RESULT.md'],
    });
    const prompt = buildZeroConfigPlanPrompt('Write the canary result', 'canary', [], undefined, contract);

    expect(prompt).toContain('Create exactly 1 task');
    expect(prompt).toContain('Do not create a separate integration/test task');
    expect(prompt).toContain('docs/CANARY-RESULT.md');
    expect(prompt).toContain('scope.filesWrite MUST equal this exact list');
    expect(prompt).toContain('scope.directories MUST be []');
    expect(prompt).toContain('Analysis-only paths belong in scope.filesRead');
    expect(prompt).not.toContain('The last task MUST be an integration/test task');
    expect(prompt).toContain('read-only or unchanged proof target');
    expect(prompt).toContain('scope.filesRead');
  });
});

describe('planner plan contract — deterministic pre-dispatch validation and repair', () => {
  const contract = derivePlannerPlanContract({
    mode: 'closed-allowlist',
    filesWrite: ['docs/CANARY-RESULT.md'],
  });

  it('normalizes against the explicit project root before validating the consumed plan', () => {
    const candidate = task('Write result');
    candidate.description = 'Read docs/MASTER-PLAN.md. Then update docs/CANARY-RESULT.md.';
    candidate.goNogo.goCriteria =
      'docs/CANARY-RESULT.md contains disk-derived evidence and docs/MASTER-PLAN.md remains unchanged.';
    const normalized = normalizePlannerResultForContract(
      { reasoning: 'fixture', tasks: [candidate] },
      {
        projectRoot: '/explicit/project',
        trackedFiles: ['docs/MASTER-PLAN.md', 'docs/CANARY-RESULT.md'],
        readFile: () => null,
      },
    );

    expect(normalized.tasks[0]?.scope.filesRead).toContain('docs/MASTER-PLAN.md');
    expect(validatePlannerPlanContract(
      normalized,
      contract,
      ['docs/MASTER-PLAN.md', 'docs/CANARY-RESULT.md'],
    )).toEqual([]);
  });

  it('names cardinality and undeclared shared-writer topology violations without model prose', () => {
    const result = {
      reasoning: 'model prose is not authority',
      tasks: [task('One'), task('Two')],
    };
    const issues = validatePlannerPlanContract(result, contract, ['README.md', 'docs/CANARY-RESULT.md']);

    expect(issues).toContain('tasks:cardinality:expected-1-1:actual-2');
    expect(issues).toContain('topology:undeclared-writer-collision:docs/CANARY-RESULT.md:slots-1,2');
    expect(issues.join(' ')).not.toContain(result.reasoning);
  });

  it('requires a referenced read-only path in filesRead without converting it to write authority', () => {
    const missingRead = task('Write result');
    missingRead.description = 'Read README.md, then update docs/CANARY-RESULT.md.';
    const missingIssues = validatePlannerPlanContract(
      { reasoning: 'fixture', tasks: [missingRead] },
      contract,
      ['README.md', 'docs/CANARY-RESULT.md'],
    );
    expect(missingIssues).toContain('scope:MENTIONED_NOT_READABLE:README.md:slot-1');

    const declaredRead = task('Write result');
    declaredRead.description = missingRead.description;
    declaredRead.scope.filesRead = ['README.md'];
    const declaredIssues = validatePlannerPlanContract(
      { reasoning: 'fixture', tasks: [declaredRead] },
      contract,
      ['README.md', 'docs/CANARY-RESULT.md'],
    );
    expect(declaredIssues).not.toContain('scope:MENTIONED_NOT_READABLE:README.md:slot-1');
    expect(declaredRead.scope.filesWrite).toEqual(['docs/CANARY-RESULT.md']);
  });

  it('reuses the canonical real-path filter for pseudo path tokens in model prose', () => {
    const candidate = task('Write result');
    candidate.description = 'Inspect Date.now/process.env behavior, then update docs/CANARY-RESULT.md.';

    const issues = validatePlannerPlanContract(
      { reasoning: 'fixture', tasks: [candidate] },
      contract,
      ['docs/CANARY-RESULT.md'],
    );

    expect(issues.some((issue) => issue.includes('now/process.env'))).toBe(false);
  });

  it('uses the existing single corrective round-trip and accepts a repaired atomic plan', async () => {
    const first = JSON.stringify({
      reasoning: 'over-decomposed',
      tasks: [task('One'), task('Two'), task('Three'), task('Four')],
    });
    const second = JSON.stringify({ reasoning: 'atomic', tasks: [task('Write result')] });
    const prompts: string[] = [];
    const spawnFn: PlannerSpawnFn = async (_command, args) => {
      prompts.push(args.join(' '));
      return {
        status: 0,
        signal: null,
        stdout: prompts.length === 1 ? first : second,
        stderr: '',
      };
    };

    const result = await callZeroConfigPlanner(
      'Write the canary result',
      MODEL,
      'canary',
      ['README.md', 'docs/CANARY-RESULT.md'],
      adapter(),
      undefined,
      spawnFn,
      undefined,
      { defaultModel: MODEL, allowedModels: [MODEL] },
      contract,
    );

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('tasks:cardinality:expected-1-1:actual-4');
    expect(prompts[1]).toContain('topology:undeclared-writer-collision');
    expect(result?.tasks).toHaveLength(1);
  });

  it('rejects closed-scope drift before wiring completion and repairs it without weakening wiring', async () => {
    const outsideScope = task('Change runtime and write result');
    outsideScope.scope.directories = ['src/'];
    outsideScope.scope.filesWrite = ['src/runtime.ts'];
    outsideScope.description = 'Change src/runtime.ts and document the result.';
    outsideScope.goNogo.goCriteria = 'src/runtime.ts contains the runtime change.';
    outsideScope.goNogo.noGoCriteria = 'src/runtime.ts is unchanged.';
    const first = JSON.stringify({ reasoning: 'scope drift', tasks: [outsideScope] });
    const second = JSON.stringify({ reasoning: 'bounded', tasks: [task('Write result')] });
    const prompts: string[] = [];
    const spawnFn: PlannerSpawnFn = async (_command, args) => {
      prompts.push(args.join(' '));
      return { status: 0, signal: null, stdout: prompts.length === 1 ? first : second, stderr: '' };
    };

    const result = await callZeroConfigPlanner(
      'Analyze runtime health and write only the result note', MODEL, 'canary',
      ['src/runtime.ts', 'docs/CANARY-RESULT.md'], adapter(), undefined, spawnFn, undefined,
      { defaultModel: MODEL, allowedModels: [MODEL] }, contract,
    );

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain(
      'scope:write-outside-allowlist:slot-1:index-1',
    );
    expect(prompts[1]).toContain('scope:directory-write-authority-forbidden:slot-1');
    expect(prompts[1]).not.toContain('src/runtime.ts:slot-1');
    expect(prompts[1]).not.toContain('productionWiringProposal:required');
    expect(result?.tasks[0]?.scope.filesWrite).toEqual(['docs/CANARY-RESULT.md']);
    expect(result?.tasks[0]?.productionWiring).toBeUndefined();
  });

  it('rejects missing or non-canonical exact writes before provider wiring completion', () => {
    const missing = task('Missing exact write');
    missing.scope.filesWrite = [];
    const duplicate = task('Duplicate exact write');
    duplicate.scope.filesWrite = ['docs/CANARY-RESULT.md', 'docs/CANARY-RESULT.md'];

    expect(validatePlannerPlanContract(
      { reasoning: 'missing', tasks: [missing] }, contract, ['docs/CANARY-RESULT.md'],
    )).toContain('scope:exact-write-list-mismatch:slot-1');
    expect(validatePlannerPlanContract(
      { reasoning: 'duplicate', tasks: [duplicate] }, contract, ['docs/CANARY-RESULT.md'],
    )).toContain('scope:exact-write-list-mismatch:slot-1');
  });

  it('still requires registered wiring for an exact allowed production write', async () => {
    const sourceContract = derivePlannerPlanContract({
      mode: 'closed-allowlist',
      filesWrite: ['src/runtime.ts'],
    });
    const sourceTask = task('Change runtime');
    sourceTask.scope.filesWrite = ['src/runtime.ts'];
    sourceTask.description = 'Change src/runtime.ts.';
    sourceTask.goNogo.goCriteria = 'src/runtime.ts contains the change.';
    sourceTask.goNogo.noGoCriteria = 'src/runtime.ts is unchanged.';
    const invalid = JSON.stringify({ reasoning: 'missing wiring', tasks: [sourceTask] });
    const prompts: string[] = [];
    const spawnFn: PlannerSpawnFn = async (_command, args) => {
      prompts.push(args.join(' '));
      return { status: 0, signal: null, stdout: invalid, stderr: '' };
    };

    const result = await callZeroConfigPlanner(
      'Change runtime', MODEL, 'canary', ['src/runtime.ts'], adapter(), undefined, spawnFn,
      undefined, { defaultModel: MODEL, allowedModels: [MODEL] }, sourceContract,
    );

    expect(result).toBeNull();
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('productionWiringProposal:required');
  });

  it('rejects a second contract violation after exactly two attempts', async () => {
    const invalid = JSON.stringify({ reasoning: 'still split', tasks: [task('One'), task('Two')] });
    let calls = 0;
    const spawnFn: PlannerSpawnFn = async () => {
      calls += 1;
      return { status: 0, signal: null, stdout: invalid, stderr: '' };
    };

    const result = await callZeroConfigPlanner(
      'Write the canary result', MODEL, 'canary', ['docs/CANARY-RESULT.md'],
      adapter(), undefined, spawnFn, undefined,
      { defaultModel: MODEL, allowedModels: [MODEL] }, contract,
    );

    expect(result).toBeNull();
    expect(calls).toBe(2);
  });
});
