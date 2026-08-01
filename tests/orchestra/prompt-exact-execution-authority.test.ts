import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import type { RunFlowPlanSourceAuthority } from '../../src/core/run-flow-contract.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import {
  buildTaskPrompt,
  type WorkerExactExecutionAuthority,
} from '../../src/orchestra/prompt-god-template.js';
import { resolveWorkerExactExecutionAuthority } from '../../src/orchestra/task-builder.js';

function sourceAuthority(
  sourceKind: 'intent' | 'directives',
  contentSha256: string,
): RunFlowPlanSourceAuthority {
  return {
    schemaVersion: 1,
    sourceKind,
    contentSha256,
    configSha256: '1'.repeat(64),
    proposalSha256: '2'.repeat(64),
    planningInputSha256: '3'.repeat(64),
    scopeInputSha256: '4'.repeat(64),
    lineageSha256: '5'.repeat(64),
  };
}

function exact(source?: RunFlowPlanSourceAuthority) {
  return {
    flowId: 'flow-exact-authority',
    revision: 3,
    planDigest: 'a'.repeat(64),
    ...(source ? { sourceAuthority: source } : {}),
  };
}

function task(): Task {
  return {
    id: '3194-001',
    title: 'Prompt authority',
    description: 'Use the approved exact task only.',
    model: 'test-model',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'regression',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'exact authority', noGoCriteria: 'stale directive', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
  };
}

describe('RECOVERY-BORN-483-PROMPT-AUTHORITY-001', () => {
  it('excludes root DIRECTIVES for an intent-sourced exact plan', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'deckent-prompt-authority-'));
    onTestFinished(() => rmSync(tempDir, { recursive: true, force: true }));
    writeFileSync(join(tempDir, 'DIRECTIVES.md'), '# stale eight-task sprint\n');

    expect(resolveWorkerExactExecutionAuthority(
      tempDir,
      exact(sourceAuthority('intent', 'b'.repeat(64))),
    )).toMatchObject({
      sourceKind: 'intent',
      directivesProjection: 'EXCLUDED_SOURCE_KIND',
    });
  });

  it('admits only a byte-identical directives projection and rejects later drift', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'deckent-prompt-authority-'));
    onTestFinished(() => rmSync(tempDir, { recursive: true, force: true }));
    const content = '# exact directives\n';
    const digest = createHash('sha256').update(content).digest('hex');
    writeFileSync(join(tempDir, 'DIRECTIVES.md'), content);
    const authority = exact(sourceAuthority('directives', digest));

    expect(resolveWorkerExactExecutionAuthority(tempDir, authority)).toMatchObject({
      directivesProjection: 'MATCHED_CONTENT_ADDRESSED_POINTER',
      observedDirectivesSha256: digest,
    });

    writeFileSync(join(tempDir, 'DIRECTIVES.md'), '# mutated directives\n');
    expect(resolveWorkerExactExecutionAuthority(tempDir, authority)).toMatchObject({
      directivesProjection: 'EXCLUDED_DIGEST_MISMATCH',
      sourceContentSha256: digest,
    });
  });

  it('renders one digest-bound task authority while preserving invariant project policy', () => {
    const executionAuthority: WorkerExactExecutionAuthority = {
      flowId: 'flow-exact-authority',
      revision: 3,
      planDigest: 'a'.repeat(64),
      sourceKind: 'intent',
      sourceContentSha256: 'b'.repeat(64),
      directivesProjection: 'EXCLUDED_SOURCE_KIND',
    };
    const prompt = buildTaskPrompt(task(), { exactExecutionAuthority: executionAuthority }).prompt;

    expect(prompt).toContain('## Exact Execution Authority (digest-bound)');
    expect(prompt).toContain('The exact task block above is the sole mutable execution directive');
    expect(prompt).toContain('AGENTS.md/CLAUDE.md and accepted ADRs');
    expect(prompt).toContain('DIRECTIVES.md is EXCLUDED');
    expect(prompt).toContain('EXCLUDED_SOURCE_KIND');
  });
});
