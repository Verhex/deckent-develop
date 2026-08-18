import { describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';
import {
  createResultJsonParseFailure,
  parseTaskResultJsonTolerantly,
  sanitizeResultJsonControlCharacters,
} from '../../src/orchestra/result-evaluator.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';

describe('result JSON control-character tolerance', () => {
  it('round-trips a literal control character without changing its payload semantics', () => {
    const raw = '{"taskId":"549-002","notes":"before\u0000after"}';
    const parsed = parseTaskResultJsonTolerantly(raw);
    expect(parsed).toMatchObject({ state: 'parsed', sanitized: true });
    if (parsed.state === 'parsed') expect(parsed.result.notes).toBe('before\u0000after');
    expect(sanitizeResultJsonControlCharacters(raw)).toContain('before\\u0000after');
  });

  it('returns a typed terminal failure for unrecoverable malformed JSON', () => {
    const parsed = parseTaskResultJsonTolerantly('{"taskId":');
    expect(parsed.state).toBe('parse-failure');
    if (parsed.state === 'parse-failure') {
      const failure = createResultJsonParseFailure('549-002', parsed.reason);
      expect(failure).toMatchObject({ taskId: '549-002', selfAssessment: 'NO_GO', testsPassed: false });
      expect(failure.notes).toContain('RESULT_JSON_PARSE_FAILURE:');
    }
  });

  it('collects an unrecoverable result as a typed failure instead of waiting indefinitely', async () => {
    const root = join(tmpdir(), `deckent-result-json-${randomBytes(4).toString('hex')}`);
    const task: Task = {
      id: '549-002', title: 'result json', description: '', model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', reason: '', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.EXECUTING, sprintId: 'sprint-result-json', assignedAgent: 'generic', assignedSkills: [],
    } as Task;
    const sprint: Sprint = {
      id: 'sprint-result-json', number: 1, tasks: [task], workers: [], phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE, startedAt: new Date().toISOString(),
    } as Sprint;
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.tasks', 'task-549-002.result'), '{"taskId":', 'utf-8');
    try {
      const results = await waitForResults(root, sprint, 250);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ taskId: '549-002', selfAssessment: 'NO_GO', testsPassed: false });
      expect(results[0]!.notes).toContain('RESULT_JSON_PARSE_FAILURE:');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
