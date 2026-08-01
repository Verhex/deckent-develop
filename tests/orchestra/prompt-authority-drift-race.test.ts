import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
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

function digestOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

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
    flowId: 'flow-drift-race',
    revision: 7,
    planDigest: 'a'.repeat(64),
    ...(source ? { sourceAuthority: source } : {}),
  };
}

function task(): Task {
  return {
    id: '485-005',
    title: 'Prompt authority drift-race assurance',
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

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-prompt-authority-drift-race-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

describe('485-005 prompt authority drift-race assurance', () => {
  it('excludes a retained root DIRECTIVES file for an intent-sourced plan', () => {
    const root = makeTempRoot();
    writeFileSync(join(root, 'DIRECTIVES.md'), '# retained sprint directives, unrelated to this attempt\n');

    const authority = resolveWorkerExactExecutionAuthority(
      root,
      exact(sourceAuthority('intent', 'b'.repeat(64))),
    );

    expect(authority).toMatchObject({
      sourceKind: 'intent',
      directivesProjection: 'EXCLUDED_SOURCE_KIND',
    });
  });

  it('admits a byte-identical directives-sourced projection', () => {
    const root = makeTempRoot();
    const content = '# exact directives for this approved run\n';
    const digest = digestOf(content);
    writeFileSync(join(root, 'DIRECTIVES.md'), content);

    const authority = resolveWorkerExactExecutionAuthority(
      root,
      exact(sourceAuthority('directives', digest)),
    );

    expect(authority).toMatchObject({
      directivesProjection: 'MATCHED_CONTENT_ADDRESSED_POINTER',
      observedDirectivesSha256: digest,
    });
  });

  it('excludes a directives projection mutated between approval and prompt assembly', () => {
    const root = makeTempRoot();
    const approvedContent = '# approved at plan time\n';
    const approvedDigest = digestOf(approvedContent);
    writeFileSync(join(root, 'DIRECTIVES.md'), approvedContent);
    const approvedAuthority = exact(sourceAuthority('directives', approvedDigest));

    // Race window: a competing process mutates DIRECTIVES.md after approval but
    // before this attempt's prompt assembly reads it.
    const mutatedContent = '# mutated after approval, before assembly\n';
    writeFileSync(join(root, 'DIRECTIVES.md'), mutatedContent);

    const authority = resolveWorkerExactExecutionAuthority(root, approvedAuthority);

    expect(authority).toMatchObject({
      directivesProjection: 'EXCLUDED_DIGEST_MISMATCH',
      sourceContentSha256: approvedDigest,
      observedDirectivesSha256: digestOf(mutatedContent),
    });
    expect(authority?.sourceContentSha256).not.toBe(authority?.observedDirectivesSha256);
  });

  it('excludes when source bytes go missing at prompt-assembly time', () => {
    const root = makeTempRoot();
    const content = '# present at approval time\n';
    const digest = digestOf(content);
    writeFileSync(join(root, 'DIRECTIVES.md'), content);
    const authority = exact(sourceAuthority('directives', digest));

    unlinkSync(join(root, 'DIRECTIVES.md'));

    expect(resolveWorkerExactExecutionAuthority(root, authority)).toMatchObject({
      sourceKind: 'directives',
      sourceContentSha256: digest,
      directivesProjection: 'EXCLUDED_MISSING',
    });
  });

  it('excludes replay of an older revision/digest against current directives content', () => {
    const root = makeTempRoot();
    const v1Content = '# v1 approved content\n';
    const v1Digest = digestOf(v1Content);
    writeFileSync(join(root, 'DIRECTIVES.md'), v1Content);
    const staleAuthority = exact(sourceAuthority('directives', v1Digest));

    // Legitimate later update to v2 — DIRECTIVES.md moves on with a fresh sprint.
    const v2Content = '# v2 legitimately superseding content\n';
    writeFileSync(join(root, 'DIRECTIVES.md'), v2Content);

    // A stale/replayed authority object still carrying the v1 digest must not be
    // silently accepted just because it was valid at some earlier point in time.
    const replayed = resolveWorkerExactExecutionAuthority(root, staleAuthority);
    expect(replayed).toMatchObject({
      directivesProjection: 'EXCLUDED_DIGEST_MISMATCH',
      sourceContentSha256: v1Digest,
      observedDirectivesSha256: digestOf(v2Content),
    });

    // Re-resolving twice in a row must be idempotent — no cached "was valid" state.
    const replayedAgain = resolveWorkerExactExecutionAuthority(root, staleAuthority);
    expect(replayedAgain).toEqual(replayed);
  });

  it('keeps invariant AGENTS/CLAUDE/ADR policy language while excluding the drifted directive with typed provenance', () => {
    const executionAuthority: WorkerExactExecutionAuthority = {
      flowId: 'flow-drift-race',
      revision: 7,
      planDigest: 'a'.repeat(64),
      sourceKind: 'directives',
      sourceContentSha256: 'b'.repeat(64),
      observedDirectivesSha256: 'c'.repeat(64),
      directivesProjection: 'EXCLUDED_DIGEST_MISMATCH',
    };
    const prompt = buildTaskPrompt(task(), { exactExecutionAuthority: executionAuthority }).prompt;

    expect(prompt).toContain('## Exact Execution Authority (digest-bound)');
    expect(prompt).toContain('The exact task block above is the sole mutable execution directive');
    expect(prompt).toContain('AGENTS.md/CLAUDE.md and accepted ADRs');
    expect(prompt).toContain('DIRECTIVES.md is EXCLUDED');
    expect(prompt).toContain('EXCLUDED_DIGEST_MISMATCH');
    expect(prompt).not.toContain('verified content-addressed pointer for this run');
  });
});
