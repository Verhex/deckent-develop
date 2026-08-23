import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyRuntimeEvaluationRetention,
  planRuntimeEvaluationRetention,
} from '../../src/core/runtime-evaluation-retention.js';
import { resolveSprintArchiveDir, verifySprintArchive } from '../../src/core/sprint-archive.js';

let root: string;
const sprintId = 'sprint-625';

function write(relativePath: string, content: string): string {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'evaluation-retention-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('runtime evaluation audit retention', () => {
  it('archives nested opaque attempts, verifies family digests, then retires them', () => {
    const first = write(
      '.deckent/runtime/evaluations/sprint-625/625-001/625-001-attempt-1.json',
      '{malformed-json',
    );
    const second = write(
      '.deckent/runtime/evaluations/sprint-625/nested/retry/625-001-attempt-2.json',
      '{"decision":"DONE"}',
    );

    const result = applyRuntimeEvaluationRetention(planRuntimeEvaluationRetention(root, sprintId));

    expect(result.failures).toEqual([]);
    expect(result.archiveVerified).toBe(true);
    expect(result.retired).toHaveLength(2);
    expect(existsSync(first)).toBe(false);
    expect(existsSync(second)).toBe(false);
    const archive = resolveSprintArchiveDir(root, sprintId);
    expect(readFileSync(join(archive, 'evaluations/625-001/625-001-attempt-1.json'), 'utf8'))
      .toBe('{malformed-json');
    expect(verifySprintArchive(root, sprintId)).toMatchObject({ ok: true, checked: 2 });
    const manifest = JSON.parse(readFileSync(join(archive, 'manifest.json'), 'utf8')) as {
      artifactCount: number; familyCounts: { evaluations: number }; artifacts: Array<{ sha256: string }>;
    };
    expect(manifest.artifactCount).toBe(2);
    expect(manifest.familyCounts.evaluations).toBe(2);
    expect(manifest.artifacts.every(item => /^[a-f0-9]{64}$/u.test(item.sha256))).toBe(true);
  });

  it('preserves conflicting attempts at both locations and manifests both variants', () => {
    const source = write(
      '.deckent/runtime/evaluations/sprint-625/625-001-attempt-1.json',
      'new-attempt-bytes',
    );
    write('.deckent/archive/sprints/sprint-625/evaluations/625-001-attempt-1.json', 'prior-bytes');

    const result = applyRuntimeEvaluationRetention(planRuntimeEvaluationRetention(root, sprintId));

    expect(result.failures).toEqual([]);
    expect(result.archiveVerified).toBe(true);
    expect(result.retired).toEqual([]);
    expect(existsSync(source)).toBe(true);
    const manifest = JSON.parse(readFileSync(
      join(resolveSprintArchiveDir(root, sprintId), 'manifest.json'), 'utf8',
    )) as { familyCounts: { evaluations: number }; conflicts: Array<{ path: string; variants: string[] }> };
    expect(manifest.familyCounts.evaluations).toBe(2);
    expect(manifest.conflicts).toEqual([expect.objectContaining({
      path: 'evaluations/625-001-attempt-1.json',
      variants: expect.arrayContaining([
        'evaluations/625-001-attempt-1.json',
        expect.stringMatching(/^evaluations\/conflicts\/625-001-attempt-1\.json\.[a-f0-9]{16}$/u),
      ]),
    })]);
  });

  it('keeps the current window and prevents malformed or foreign ownership leakage', () => {
    const current = write('.deckent/runtime/evaluations/sprint-625/625-001-attempt-1.json', 'current');
    const malformed = write('.deckent/runtime/evaluations/sprint-625/625-001.json', 'malformed-name');
    const foreign = write('.deckent/runtime/evaluations/sprint-625/624-001-attempt-1.json', 'foreign');

    const currentPlan = planRuntimeEvaluationRetention(root, sprintId, { currentSprintIds: [sprintId] });
    expect(currentPlan.reconcile).toEqual([]);
    expect(currentPlan.hold).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'current-window' }),
      expect.objectContaining({ reason: 'malformed-attempt-name' }),
      expect.objectContaining({ reason: 'foreign-sprint' }),
    ]));
    const result = applyRuntimeEvaluationRetention(currentPlan);
    expect(result.retired).toEqual([]);
    expect(existsSync(current)).toBe(true);
    expect(existsSync(malformed)).toBe(true);
    expect(existsSync(foreign)).toBe(true);
    expect(existsSync(join(resolveSprintArchiveDir(root, sprintId), 'manifest.json'))).toBe(false);
  });

  it('retires a pre-existing canonical duplicate but never foreign siblings', () => {
    const owned = write('.deckent/runtime/evaluations/sprint-625/625-002-attempt-3.json', 'same');
    const foreign = write('.deckent/runtime/evaluations/sprint-625/626-001-attempt-1.json', 'foreign');
    let result = applyRuntimeEvaluationRetention(planRuntimeEvaluationRetention(root, sprintId));
    expect(result.failures).toEqual([]);
    expect(existsSync(owned)).toBe(false);
    expect(existsSync(foreign)).toBe(true);

    const restored = write('.deckent/runtime/evaluations/sprint-625/625-002-attempt-3.json', 'same');
    const plan = planRuntimeEvaluationRetention(root, sprintId);
    expect(plan.retire).toHaveLength(1);
    result = applyRuntimeEvaluationRetention(plan);
    expect(result.failures).toEqual([]);
    expect(existsSync(restored)).toBe(false);
    expect(existsSync(foreign)).toBe(true);
    const manifestText = readFileSync(join(resolveSprintArchiveDir(root, sprintId), 'manifest.json'), 'utf8');
    expect(manifestText).not.toContain('626-001-attempt-1.json');
  });

  it('keeps changed source bytes when a plan becomes stale', () => {
    const source = write('.deckent/runtime/evaluations/sprint-625/625-003-attempt-1.json', 'before');
    const plan = planRuntimeEvaluationRetention(root, sprintId);
    writeFileSync(source, 'after');

    const result = applyRuntimeEvaluationRetention(plan);
    expect(result.failures.some(failure => failure.includes('SOURCE_CHANGED'))).toBe(true);
    expect(readFileSync(source, 'utf8')).toBe('after');
  });
});
