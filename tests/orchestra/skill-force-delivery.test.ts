/**
 * tests/orchestra/skill-force-delivery.test.ts
 *
 * 561-003 — two invariants, proven against the real code paths:
 *
 *  1. FORCE-EZME: an operator's explicit `- Skills:` directive produces the
 *     SAME effective assignment on every launch path (sprint routing, the
 *     debt-manager FIX rotation, and the direct-V3 single-task path that
 *     overwrites `task.assignedSkills` wholesale). A routing result that is
 *     empty — or simply does not contain the forced id — can no longer erase
 *     it, and a forced skill that cannot be delivered keeps its typed-HOLD
 *     treatment instead of being silently credited.
 *
 *  2. DELIVERY-PROOF: the recorded evidence set is byte-equal to the skill ids
 *     whose SKILL.md body is actually rendered into the worker prompt, so stat
 *     credit can follow DELIVERY rather than ASSIGNMENT.
 *
 * Hermetic: every filesystem fixture lives in a fresh tmpdir; no build, no
 * network, no repo state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, ResolvedConfig, ProviderName } from '../../src/core/types.js';
import {
  applySkillDirectiveAuthority,
  buildSkillDeliveryEvidence,
  buildWorkerPrompt,
  readSkillDeliveryEvidence,
  skillDeliveryEvidencePath,
  writeSkillDeliveryEvidence,
  type SkillDeliveryProbe,
} from '../../src/orchestra/task-builder.js';
import { routeSprintTasks, routeSprintTasksForExecution } from '../../src/orchestra/sprint-spawner.js';
import { mergeForcePreservingSkillIds } from '../../src/orchestra/routing-plan-adapter.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const FORCED_BODY = 'Forced skill body marker: honour the operator directive.';
const ROUTED_BODY = 'Routed skill body marker: chosen by the router.';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '561-003-t',
    title: 'Force and delivery consistency',
    description: 'desc',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-561',
    createdAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  } as Task;
}

/** Materialize a catalog skill the pool can actually resolve a body for. */
function writeFixtureSkill(root: string, id: string, body: string, enabled = true): void {
  const dir = join(root, '.deckent', 'skills', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `# ${id}\n\n${body}\n`, 'utf-8');
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify(
      {
        id,
        source: 'user',
        name: id,
        version: '0.1.0',
        description: `${id} fixture skill`,
        manifestVersion: 2,
        entrypoint: 'SKILL.md',
        category: 'tool',
        triggers: [id],
        stackDetection: { files: [], dependencies: [], commands: [] },
        composableWith: [],
        priority: 5,
        promptInjection: { position: 'append', maxTokens: 1200 },
        enabled,
        stats: { totalUses: 0, successCount: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
      },
      null,
      2,
    ),
    'utf-8',
  );
}

/**
 * The skill ids the prompt REALLY carries, read back out of the rendered
 * `=== Skills ===` block. This is the independent side of the byte-equality
 * check: the evidence is produced by `buildSkillBlock`, this reads the bytes.
 */
function renderedSkillIds(prompt: string): string[] {
  const start = prompt.indexOf('=== Skills ===');
  if (start < 0) return [];
  const ids: string[] = [];
  for (const line of prompt.slice(start).split('\n')) {
    const match = /^--- ([a-z0-9][a-z0-9-]*) ---$/.exec(line);
    if (match) ids.push(match[1]!);
  }
  return ids;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-force-delivery-'));
  mkdirSync(join(root, '.tasks'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── 1. applySkillDirectiveAuthority — the shared force/exclude authority ────

describe('applySkillDirectiveAuthority — force/exclude consistency', () => {
  it('an empty routing result does NOT erase the operator force (the 9034 overwrite bug)', () => {
    const task = makeTask({ forceSkills: ['forced-skill'], assignedSkills: [] });
    expect(applySkillDirectiveAuthority(task)).toEqual(['forced-skill']);
    expect(task.assignedSkills).toEqual(['forced-skill']);
  });

  it('unions the force in without dropping routing-derived skills', () => {
    const task = makeTask({ forceSkills: ['forced-skill'], assignedSkills: ['routed-skill'] });
    expect(applySkillDirectiveAuthority(task)).toEqual(['routed-skill', 'forced-skill']);
  });

  it('never duplicates a forced id already assigned', () => {
    const task = makeTask({ forceSkills: ['forced-skill'], assignedSkills: ['forced-skill'] });
    expect(applySkillDirectiveAuthority(task)).toEqual(['forced-skill']);
  });

  it('excludeSkills prunes a routing-derived skill', () => {
    const task = makeTask({ excludeSkills: ['routed-skill'], assignedSkills: ['routed-skill', 'keep-me'] });
    expect(applySkillDirectiveAuthority(task)).toEqual(['keep-me']);
  });

  it('force beats exclude when the operator named the same id in both', () => {
    const task = makeTask({
      forceSkills: ['forced-skill'],
      excludeSkills: ['forced-skill'],
      assignedSkills: ['forced-skill'],
    });
    expect(applySkillDirectiveAuthority(task)).toEqual(['forced-skill']);
  });

  it('is idempotent — a second application changes nothing', () => {
    const task = makeTask({
      forceSkills: ['forced-skill'],
      excludeSkills: ['drop-me'],
      assignedSkills: ['drop-me', 'routed-skill'],
    });
    const first = [...applySkillDirectiveAuthority(task)];
    expect(applySkillDirectiveAuthority(task)).toEqual(first);
    expect(first).toEqual(['routed-skill', 'forced-skill']);
  });

  it('an AUTO-assigned skill is never promoted into forceSkills (GR-2026-08-08-DOGFOOD-RCPT2-01)', () => {
    const noForce = makeTask({ assignedSkills: ['auto-picked'] });
    applySkillDirectiveAuthority(noForce);
    expect(noForce.forceSkills).toBeUndefined();
    expect(noForce.assignedSkills).toEqual(['auto-picked']);

    const withForce = makeTask({ forceSkills: ['forced-skill'], assignedSkills: ['auto-picked'] });
    applySkillDirectiveAuthority(withForce);
    expect(withForce.forceSkills).toEqual(['forced-skill']);
  });

  it('leaves a task with no directives untouched', () => {
    const task = makeTask({ assignedSkills: ['auto-picked'] });
    expect(applySkillDirectiveAuthority(task)).toEqual(['auto-picked']);
    const bare = makeTask();
    expect(applySkillDirectiveAuthority(bare)).toEqual([]);
    expect(bare.assignedSkills).toBeUndefined();
  });
});

// ─── 2. Three-path consistency ──────────────────────────────────────────────

describe('force survives identically on the sprint, FIX and single-task paths', () => {
  const allProviders: ProviderName[] = ['claude', 'codex', 'gemini'];
  const config = {} as unknown as ResolvedConfig;

  /** All three paths start from the SAME shape: force declared, routing empty. */
  function erasedByRouting(overrides: Partial<Task> = {}): Task {
    return makeTask({ forceSkills: ['forced-skill'], assignedSkills: [], ...overrides });
  }

  it('sprint path — routeSprintTasks keeps the force', () => {
    const tasks = [erasedByRouting()];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedSkills).toEqual(['forced-skill']);
  });

  it('sprint path — an approved exact plan keeps the force without re-routing', () => {
    const tasks = [erasedByRouting({ assignedAgent: 'implementer', provider: 'claude' })];
    routeSprintTasksForExecution(
      tasks,
      config,
      allProviders,
      { projectRoot: root, sprintId: 'sprint-561' },
      { flowId: 'flow-1', revision: 1, planDigest: 'sha256:deadbeef' },
    );
    expect(tasks[0]!.assignedSkills).toEqual(['forced-skill']);
    // Exact-plan execution must NOT re-derive the approved agent/provider.
    expect(tasks[0]!.assignedAgent).toBe('implementer');
    expect(tasks[0]!.provider).toBe('claude');
  });

  it('FIX path — a rotated forceSkills FIX task keeps the force', () => {
    const tasks = [
      erasedByRouting({ id: '561-003-t-fix', isPriorityFix: true, fixForTaskId: '561-003-t' }),
    ];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedSkills).toEqual(['forced-skill']);
  });

  it('single-task path — buildWorkerPrompt repairs a direct-V3 wholesale overwrite', () => {
    writeFixtureSkill(root, 'forced-skill', FORCED_BODY);
    // Exactly how task-mode-runner.ts calls it: routeSingleTaskV3 has already
    // replaced assignedSkills, so resolveSkillPrompts loaded nothing.
    const task = erasedByRouting();
    const prompt = buildWorkerPrompt(task, undefined, [], root);
    expect(task.assignedSkills).toEqual(['forced-skill']);
    expect(prompt).toContain('--- forced-skill ---');
    expect(prompt).toContain(FORCED_BODY);
  });

  it('all three paths agree on the same effective assignment', () => {
    writeFixtureSkill(root, 'forced-skill', FORCED_BODY);
    const sprintTask = erasedByRouting();
    const fixTask = erasedByRouting({ id: '561-003-t-fix', isPriorityFix: true, fixForTaskId: '561-003-t' });
    const singleTask = erasedByRouting();

    routeSprintTasks([sprintTask, fixTask], config, allProviders);
    buildWorkerPrompt(singleTask, undefined, [], root);

    expect(sprintTask.assignedSkills).toEqual(fixTask.assignedSkills);
    expect(sprintTask.assignedSkills).toEqual(singleTask.assignedSkills);
  });

  it('a disabled forced skill is NOT silently revived into the prompt (487-023)', () => {
    writeFixtureSkill(root, 'forced-skill', FORCED_BODY, false);
    const task = erasedByRouting();
    const prompt = buildWorkerPrompt(task, undefined, [], root);
    // The directive still stands on the record — the typed HOLD upstream owns
    // the refusal — but the disabled body never reaches the worker.
    expect(task.assignedSkills).toEqual(['forced-skill']);
    expect(prompt).not.toContain(FORCED_BODY);
  });
});

// ─── 3. Delivery proof ──────────────────────────────────────────────────────

describe('delivery evidence is byte-equal to the rendered skill ids', () => {
  it('the probe reports exactly the ids present in the prompt bytes', () => {
    const task = makeTask({ assignedSkills: ['routed-skill'] });
    const probe: SkillDeliveryProbe = { deliveredSkillIds: [] };
    const prompt = buildWorkerPrompt(
      task,
      undefined,
      [{ name: 'routed-skill', content: ROUTED_BODY }],
      root,
      undefined,
      undefined,
      probe,
    );
    expect(renderedSkillIds(prompt)).toEqual(['routed-skill']);
    expect(probe.deliveredSkillIds).toEqual(renderedSkillIds(prompt));
  });

  it('a forced skill recovered on the direct-V3 path is counted as delivered', () => {
    writeFixtureSkill(root, 'forced-skill', FORCED_BODY);
    const task = makeTask({ forceSkills: ['forced-skill'], assignedSkills: [] });
    const probe: SkillDeliveryProbe = { deliveredSkillIds: [] };
    const prompt = buildWorkerPrompt(task, undefined, [], root, undefined, undefined, probe);

    expect(probe.deliveredSkillIds).toEqual(renderedSkillIds(prompt));
    expect(probe.deliveredSkillIds).toContain('forced-skill');

    const evidence = buildSkillDeliveryEvidence(task, probe.deliveredSkillIds);
    expect(evidence.undeliveredForcedSkillIds).toEqual([]);
  });

  it('a skill dropped from the render is NOT credited as delivered (no phantom credit)', () => {
    // WP-17: a skill whose id equals the assigned agent is dropped by the
    // template — assignment says two, delivery is one.
    const task = makeTask({ assignedAgent: 'documentation-writer', assignedSkills: ['documentation-writer', 'routed-skill'] });
    const probe: SkillDeliveryProbe = { deliveredSkillIds: [] };
    const prompt = buildWorkerPrompt(
      task,
      undefined,
      [
        { name: 'documentation-writer', content: 'agent-named skill body' },
        { name: 'routed-skill', content: ROUTED_BODY },
      ],
      root,
      undefined,
      undefined,
      probe,
    );

    expect(renderedSkillIds(prompt)).toEqual(['routed-skill']);
    expect(probe.deliveredSkillIds).toEqual(['routed-skill']);
    expect(task.assignedSkills).toContain('documentation-writer');
  });

  it('an unresolvable forced skill is reported undelivered, never as credit', () => {
    const task = makeTask({ forceSkills: ['no-such-skill'], assignedSkills: [] });
    const probe: SkillDeliveryProbe = { deliveredSkillIds: [] };
    const prompt = buildWorkerPrompt(task, undefined, [], root, undefined, undefined, probe);

    expect(renderedSkillIds(prompt)).toEqual([]);
    expect(probe.deliveredSkillIds).toEqual([]);

    const evidence = buildSkillDeliveryEvidence(task, probe.deliveredSkillIds);
    expect(evidence.deliveredSkillIds).toEqual([]);
    expect(evidence.forcedSkillIds).toEqual(['no-such-skill']);
    expect(evidence.undeliveredForcedSkillIds).toEqual(['no-such-skill']);
  });
});

describe('delivery evidence sidecar', () => {
  it('round-trips through .tasks/task-<id>.skill-delivery.json', () => {
    const task = makeTask({ forceSkills: ['forced-skill'], assignedSkills: ['forced-skill', 'routed-skill'] });
    const evidence = buildSkillDeliveryEvidence(task, ['routed-skill']);
    expect(writeSkillDeliveryEvidence(root, evidence)).toBe(true);
    expect(existsSync(skillDeliveryEvidencePath(root, task.id))).toBe(true);

    const read = readSkillDeliveryEvidence(root, task.id);
    expect(read).toEqual(evidence);
    expect(read!.deliveredSkillIds).toEqual(['routed-skill']);
    expect(read!.undeliveredForcedSkillIds).toEqual(['forced-skill']);
  });

  it('returns null when no proof was recorded — absence is not "nothing delivered"', () => {
    expect(readSkillDeliveryEvidence(root, 'never-spawned')).toBeNull();
  });
});

// ─── 5. 587-001 — the V3 assignment seam itself ─────────────────────────────
//
// Everything above proves the DOWNSTREAM repair (buildWorkerPrompt /
// routeSprintTasks put a lost force back). These pins lock the seam where the
// loss used to happen: both V3 sites — routeTasksV3ForPlan (routing-plan-
// adapter.ts) and task-mode-runner's direct routeSingleTaskV3 call — now
// assign through mergeForcePreservingSkillIds instead of overwriting
// task.assignedSkills wholesale.

describe('mergeForcePreservingSkillIds — force survives the V3 write (587-001)', () => {
  it('a V3 decision that omits the forced id can no longer erase it', () => {
    const task = makeTask({ forceSkills: ['forced-skill'] });
    expect(mergeForcePreservingSkillIds(task, ['routed-skill'])).toEqual([
      'forced-skill',
      'routed-skill',
    ]);
  });

  it('an EMPTY V3 decision still leaves the force standing', () => {
    const task = makeTask({ forceSkills: ['forced-skill'] });
    expect(mergeForcePreservingSkillIds(task, [])).toEqual(['forced-skill']);
  });

  it('orders force first, then the V3-derived ids, with no duplicates', () => {
    const task = makeTask({ forceSkills: ['forced-a', 'forced-b', 'forced-a'] });
    expect(mergeForcePreservingSkillIds(task, ['forced-b', 'routed-skill', 'routed-skill']))
      .toEqual(['forced-a', 'forced-b', 'routed-skill']);
  });

  it('excludeSkills prunes a V3-derived id', () => {
    const task = makeTask({ excludeSkills: ['drop-me'] });
    expect(mergeForcePreservingSkillIds(task, ['drop-me', 'keep-me'])).toEqual(['keep-me']);
  });

  it('excludeSkills can NEVER remove a forced id — the directive force wins', () => {
    const task = makeTask({ forceSkills: ['forced-skill'], excludeSkills: ['forced-skill'] });
    expect(mergeForcePreservingSkillIds(task, [])).toEqual(['forced-skill']);
    expect(mergeForcePreservingSkillIds(task, ['forced-skill', 'routed-skill']))
      .toEqual(['forced-skill', 'routed-skill']);
  });

  it('passes a V3 decision through untouched when no directive is declared', () => {
    const bare = makeTask();
    expect(mergeForcePreservingSkillIds(bare, ['routed-a', 'routed-b']))
      .toEqual(['routed-a', 'routed-b']);
    expect(mergeForcePreservingSkillIds(bare, [])).toEqual([]);
    // AUTO-assignment is never promoted into forceSkills by the merge.
    expect(bare.forceSkills).toBeUndefined();
  });

  it('is idempotent — re-merging an already-merged assignment is stable', () => {
    const task = makeTask({ forceSkills: ['forced-skill'], excludeSkills: ['drop-me'] });
    const first = mergeForcePreservingSkillIds(task, ['drop-me', 'routed-skill']);
    expect(first).toEqual(['forced-skill', 'routed-skill']);
    expect(mergeForcePreservingSkillIds(task, first)).toEqual(first);
  });

  it('agrees with applySkillDirectiveAuthority on the effective SET (both authorities, one outcome)', () => {
    const merged = makeTask({
      forceSkills: ['forced-skill'],
      excludeSkills: ['drop-me'],
      assignedSkills: mergeForcePreservingSkillIds(
        { forceSkills: ['forced-skill'], excludeSkills: ['drop-me'] },
        ['drop-me', 'routed-skill'],
      ),
    });
    const before = [...merged.assignedSkills!];
    // The render-time authority must find nothing left to repair.
    expect(applySkillDirectiveAuthority(merged)).toEqual(before);
    expect([...before].sort()).toEqual(['forced-skill', 'routed-skill']);
  });

  it('task-mode-runner site — the direct-V3 assignment keeps the force', () => {
    // Exactly the shape of task-mode-runner.ts:
    //   task.assignedSkills = mergeForcePreservingSkillIds(task, v3.skillIds)
    const task = makeTask({ forceSkills: ['forced-skill'], assignedSkills: ['stale-skill'] });
    const v3SkillIds: string[] = ['routed-skill'];
    task.assignedSkills = mergeForcePreservingSkillIds(task, v3SkillIds);
    expect(task.assignedSkills).toEqual(['forced-skill', 'routed-skill']);
    expect(task.assignedSkills).not.toContain('stale-skill');
  });
});
