// tests/orchestra/worker-core-system-prompt.test.ts
// 7094-F3 (flag-gated, default OFF) — the task-invariant worker core is
// externalized to `claude --bare --system-prompt-file <core>`:
//   • buildWorkerCoreSystemPrompt renders the SAME constants the inline T0
//     path pushes (one source, two projections), with the inspection/doc
//     variants mirroring the inline classifier;
//   • ctx.coreExternalized suppresses the duplicate inline blocks;
//   • the flag OFF keeps the prompt byte-identical (default-path parity).
import { describe, expect, it } from 'vitest';
import {
  buildTaskPrompt,
  buildWorkerCoreSystemPrompt,
} from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: '900-001',
    title: 'core test',
    description: 'write code',
    status: TaskStatus.PENDING,
    createdAt: new Date().toISOString(),
    scope: { directories: ['src/'], filesRead: ['src/a.ts'], filesWrite: ['src/a.ts'] },
    goNogo: { goCriteria: 'done', noGoCriteria: 'broken', techDebtAcceptable: '' },
    ...over,
  } as Task;
}

describe('buildWorkerCoreSystemPrompt (7094-F3)', () => {
  it('code-class core carries all four anchors plus the npm advisory', () => {
    const core = buildWorkerCoreSystemPrompt(makeTask({ type: 'code-development' } as Partial<Task>));
    expect(core).toContain('## Karpathy Discipline');
    expect(core).toContain('## Turn Economy');
    expect(core).toContain('## Pipe-Exit Honesty');
    expect(core).toContain('## Artifact Reuse');
    expect(core).toContain('## Dependency-Mutation Advisory');
  });

  it('doc-only core drops the npm advisory; inspection-only core is the read-only discipline', () => {
    const doc = buildWorkerCoreSystemPrompt(makeTask({ type: 'documentation' } as Partial<Task>));
    expect(doc).toContain('## Karpathy Discipline');
    expect(doc).not.toContain('## Dependency-Mutation Advisory');
    const insp = buildWorkerCoreSystemPrompt(makeTask({
      scope: { directories: [], filesRead: ['src/a.ts'], filesWrite: [] },
    }));
    expect(insp).toContain('## Karpathy Discipline (read-only)');
  });

  it('ctx.coreExternalized suppresses the inline blocks; OFF keeps them (parity)', () => {
    const task = makeTask({ type: 'code-development' } as Partial<Task>);
    const off = buildTaskPrompt(task, { agentId: 'generic', skillPrompts: [] } as never);
    const on = buildTaskPrompt(task, { agentId: 'generic', skillPrompts: [], coreExternalized: true } as never);
    expect(off.prompt).toContain('## Karpathy Discipline');
    expect(off.prompt).toContain('## Dependency-Mutation Advisory');
    expect(on.prompt).not.toContain('## Karpathy Discipline');
    expect(on.prompt).not.toContain('## Dependency-Mutation Advisory');
    // The externalized core + the ON-prompt together cover the OFF content class.
    const core = buildWorkerCoreSystemPrompt(task);
    expect(core).toContain('## Turn Economy');
    expect(on.prompt.length).toBeLessThan(off.prompt.length);
  });
});
