import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { scoreAuditCompleteness } from '../../src/orchestra/result-evaluator.js';
import type { Task, TaskResult } from '../../src/core/types.js';
it('scores real report content after derived directory and missing projection entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'deckent-rubric-projection-'));
  try {
    const report = join(root, 'report.md');
    writeFileSync(report, '# Findings\n- Verified evidence\n' + 'Measured observation. '.repeat(100));
    const score = (paths: string[]) => scoreAuditCompleteness({ filesChanged: paths, notes: '' } as TaskResult, {} as Task);
    expect(score([root, join(root, 'removed.md'), report])).toEqual(score([report]));
    expect(score([root, report]).passed).toBe(true);
    expect(score([root]).passed).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
