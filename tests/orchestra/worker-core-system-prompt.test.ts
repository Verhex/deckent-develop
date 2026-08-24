// tests/orchestra/worker-core-system-prompt.test.ts
// 7094-F3 (flag-gated, default OFF) — the task-invariant worker core is
// externalized to `claude --bare --system-prompt-file <core>`:
//   • buildWorkerCoreSystemPrompt renders the SAME constants the inline T0
//     path pushes (one source, two projections), with the inspection/doc
//     variants mirroring the inline classifier;
//   • ctx.coreExternalized suppresses the duplicate inline blocks;
//   • the flag OFF keeps the prompt byte-identical (default-path parity).
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTaskPrompt,
  buildWorkerCoreSystemPrompt,
} from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import {
  buildPromptDeliveryReceipt,
  finalizePromptDeliveryReceipt,
  publishWorkerCoreArtifact,
  writePromptDeliveryReceipt,
} from '../../src/core/prompt-delivery-receipt.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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
    expect(insp).toContain('## Read-Only Role Policy');
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

  it('publishes full-SHA immutable bytes and binds the exact runtime invocation', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-worker-core-'));
    temporaryRoots.push(root);
    const core = 'immutable worker core\n';
    const artifact = publishWorkerCoreArtifact(root, core);
    const digest = createHash('sha256').update(Buffer.from(core)).digest('hex');
    expect(artifact.relativePath).toBe(`.tasks/.worker-core-${digest}.md`);
    expect(readFileSync(artifact.path, 'utf8')).toBe(core);

    const compileReceipt = buildPromptDeliveryReceipt({
      taskId: '900-001',
      prompt: 'compiled prompt',
      promptCompilePlanId: `prompt-compile-plan:sha256:${'c'.repeat(64)}`,
      rolePolicyIdentity: 'worker:implementer',
      assignedAgentId: 'implementer',
      segments: [{ kind: 'persona', content: '=== Agent: implementer ===\npolicy' }],
    });
    expect(writePromptDeliveryReceipt(root, compileReceipt)).toBe(true);
    const argv = `codex -c model_instructions_file=/workspace/${artifact.relativePath}`;
    const receipt = finalizePromptDeliveryReceipt({
      projectRoot: root,
      taskId: '900-001',
      attemptId: 'attempt-7',
      provider: 'codex',
      coreArtifactPath: artifact.relativePath,
      coreSha256: artifact.sha256,
      coreBytes: artifact.bytes,
      roleProfile: 'worker:implementer',
      injectionChannel: 'codex-model-instructions-file',
      contextSuppressionFlags: ['project_doc_max_bytes=0'],
      providerArgv: argv,
    });
    expect(receipt.runtimeDelivery).toEqual({
      attemptId: 'attempt-7',
      provider: 'codex',
      coreArtifactPath: artifact.relativePath,
      coreSha256: artifact.sha256,
      coreBytes: artifact.bytes,
      roleProfile: 'worker:implementer',
      injectionChannel: 'codex-model-instructions-file',
      contextSuppressionFlags: ['project_doc_max_bytes=0'],
      providerArgvSha256: createHash('sha256').update(argv).digest('hex'),
    });

    writeFileSync(artifact.path, 'tampered', 'utf8');
    expect(() => finalizePromptDeliveryReceipt({
      projectRoot: root,
      taskId: '900-001',
      attemptId: 'attempt-8',
      provider: 'codex',
      coreArtifactPath: artifact.relativePath,
      coreSha256: artifact.sha256,
      coreBytes: artifact.bytes,
      roleProfile: 'worker:implementer',
      injectionChannel: 'codex-model-instructions-file',
      contextSuppressionFlags: [],
      providerArgv: argv,
    })).toThrow('PROMPT_DELIVERY_RECEIPT_CORE_BYTES_MISMATCH');
  });
});
