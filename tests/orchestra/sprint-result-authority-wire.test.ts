import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('production sprint result-authority boundary', () => {
  it('loads checkpoint-resume results through the host settlement authority', async () => {
    const source = await readFile('src/orchestra/sprint-controller.ts', 'utf-8');
    const start = source.indexOf('if (recoveredSprint) {');
    const end = source.indexOf('// ─── Outer-scope variables', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const boundary = source.slice(start, end);
    expect(boundary).toContain(
      'readAuthoritativeTaskResult<TaskResult>(projectRoot, t.id)',
    );
    expect(boundary).toContain('normalizeTaskResultShape(authority.result)');
    expect(boundary).not.toContain('task-${t.id}.result');
    expect(boundary).not.toContain('readJsonSafe<TaskResult>');
  });

  it('loads post-collect late results through the same authority', async () => {
    const source = await readFile('src/orchestra/sprint-controller.ts', 'utf-8');
    const start = source.indexOf('// Post-collect sweep');
    const end = source.indexOf('// Grace period', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const boundary = source.slice(start, end);
    expect(boundary).toContain(
      'readAuthoritativeTaskResult<TaskResult>(projectRoot, task.id)',
    );
    expect(boundary).toContain('normalizeTaskResultShape(authority.result)');
    expect(boundary).not.toContain('task-${task.id}.result');
    expect(boundary).not.toContain('readJsonSafe<TaskResult>');
    expect(boundary).not.toContain('stat(');
  });

  it('gates grace and EVALUATE on settled result authority before synthetic paths', async () => {
    const source = await readFile('src/orchestra/sprint-controller.ts', 'utf-8');
    const postCollect = source.indexOf('// Post-collect sweep');
    const authorityGate = source.indexOf('assertTaskResultAuthoritiesReady(', postCollect);
    const grace = source.indexOf('// Grace period', postCollect);
    const evaluate = source.indexOf('await runEvaluatePhase(', grace);

    expect(postCollect).toBeGreaterThan(-1);
    expect(authorityGate).toBeGreaterThan(postCollect);
    expect(authorityGate).toBeLessThan(grace);
    expect(grace).toBeLessThan(evaluate);
  });

  it('makes EVALUATE authority failure terminal and checks RETRO before mutation', async () => {
    const source = await readFile('src/orchestra/sprint-phases.ts', 'utf-8');
    const evaluateStart = source.indexOf('export async function runEvaluatePhase(');
    const evaluateEnd = source.indexOf('// ═══ Rollback Check', evaluateStart);
    const evaluateBoundary = source.slice(evaluateStart, evaluateEnd);
    expect(evaluateBoundary).toContain("'evaluate-entry'");
    expect(evaluateBoundary).toContain(
      "err instanceof DeckentError && err.code === 'DECKENT_E077'",
    );
    expect(evaluateBoundary).toContain('throw err');

    const retroStart = source.indexOf('export async function runRetroPhase(');
    const retroEnd = source.indexOf('// ═══ Phase 7: DECAY', retroStart);
    const retroBoundary = source.slice(retroStart, retroEnd);
    const retroGate = retroBoundary.indexOf("'retro-entry'");
    const statusMutation = retroBoundary.indexOf('sprint.status = SprintStatus.RETROSPECTIVE');
    expect(retroGate).toBeGreaterThan(-1);
    expect(statusMutation).toBeGreaterThan(retroGate);
    expect(retroBoundary).toContain(
      'const authority = readAuthoritativeTaskResult<TaskResult>(projectRoot, task.id)',
    );
    expect(retroBoundary).toContain('const persistedResult = authority.result');
    expect(retroBoundary).not.toContain("readFileSync(resultPath, 'utf-8')");
  });
});
