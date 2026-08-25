import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { reconcileStatusResponse } from '../../src/api/status-reconcile.js';
import { buildStatusJsonSnapshot } from '../../src/cli/commands/status.js';
import {
  readCanonicalRunStatus,
  type CanonicalRunStatus,
} from '../../src/core/run-status-authority.js';
import {
  publishCanonicalRunStatusReadModel,
  readCanonicalRunStatusReadModel,
} from '../../src/core/run-status-read-model.js';
import { writeTaskHeartbeatFile } from '../../src/core/worker-activity-heartbeat.js';
import { registerStatusTool } from '../../src/mcp/tools/status.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import type { Task } from '../../src/core/types.js';

type JsonObject = Record<string, unknown>;
type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

const roots: string[] = [];

function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function terminalAuthority(
  lifecycle: 'COMPLETE' | 'ABORTED',
): CanonicalRunStatus {
  return {
    schemaVersion: 1,
    lifecycle,
    active: false,
    resumable: false,
    sprintId: 'sprint-675-evidence',
    phase: 'COMPLETE',
    status: lifecycle === 'COMPLETE' ? 'COMPLETE' : 'FAILED',
    reason: lifecycle === 'ABORTED' ? 'flow-terminal-failed' : null,
    recoveryCommand: null,
    finalizeCommand: null,
    coordinator: 'absent',
    conflicts: [],
  };
}

function projection(value: JsonObject): JsonObject {
  const readiness = value['readiness'];
  return {
    lifecycle: value['lifecycle'],
    resumable: value['resumable']
      ?? (value['authority'] as JsonObject | undefined)?.['resumable'],
    readiness: typeof readiness === 'string'
      ? readiness
      : (readiness as JsonObject | undefined)?.['state'],
  };
}

async function readMcpStatus(root: string): Promise<JsonObject> {
  let handler: ToolHandler | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, candidate: ToolHandler) => {
      handler = candidate;
    },
  };
  registerStatusTool(
    server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
  );
  const previous = process.cwd();
  try {
    process.chdir(root);
    const result = await handler!({ json: true });
    return JSON.parse(result.content[0]!.text) as JsonObject;
  } finally {
    process.chdir(previous);
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.sequential('event-truth wave evidence', () => {
  it('never lets competing heartbeat writes regress the durable file', async () => {
    const root = makeRoot('deckent-wave-heartbeat-');
    const path = join(root, '.tasks', 'task-race.hb');
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const newer = {
      workerId: 'w-race', taskId: 'race', status: 'EXECUTING',
      currentAction: 'newer', timestamp: '2026-08-25T12:00:02.000Z',
      filesChangedCount: 2, sequence: 2,
    };
    const stale = {
      ...newer, currentAction: 'stale',
      timestamp: '2026-08-25T12:00:01.000Z', sequence: 1,
    };

    const results = await Promise.all([
      Promise.resolve().then(() => writeTaskHeartbeatFile(path, newer)),
      Promise.resolve().then(() => writeTaskHeartbeatFile(path, stale)),
    ]);

    expect(results).toEqual([
      { state: 'WRITTEN' },
      { state: 'SKIPPED', reasonCode: 'MONOTONIC_REGRESSION' },
    ]);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(newer);
  });

  it('strictly advances competing read-model publications without losing either revision', async () => {
    const root = makeRoot('deckent-wave-read-model-');

    const [first, second] = await Promise.all([
      Promise.resolve().then(() => publishCanonicalRunStatusReadModel(root, {
        authority: terminalAuthority('COMPLETE'),
        publishedAt: '2026-08-25T12:00:01.000Z',
      })),
      Promise.resolve().then(() => publishCanonicalRunStatusReadModel(root, {
        authority: terminalAuthority('ABORTED'),
        publishedAt: '2026-08-25T12:00:02.000Z',
      })),
    ]);

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(second.modelDigest).not.toBe(first.modelDigest);
    expect(readCanonicalRunStatusReadModel(root)).toEqual(second);
  });

  it('projects a proven failed terminal flow as non-resumable ABORTED with surface parity', async () => {
    const root = makeRoot('deckent-wave-aborted-');
    writeJson(root, '.deckent/sprint-state.json', {
      sprintId: 'sprint-675-aborted', phase: 'COMPLETE', status: 'FAILED',
    });
    const authority = readCanonicalRunStatus(root);
    const cli = buildStatusJsonSnapshot(root, join(root, '.dashboard'), {});
    const mcp = await readMcpStatus(root);
    const api = reconcileStatusResponse(root, null) as JsonObject;
    const expected = {
      lifecycle: 'ABORTED', resumable: false, readiness: 'SELF_SUFFICIENT',
    };

    expect(authority).toMatchObject({ lifecycle: 'ABORTED', resumable: false });
    expect(projection(cli)).toEqual(expected);
    expect(projection(mcp)).toEqual(expected);
    expect(projection(api)).toEqual(expected);
  });

  it('renders object-form dependency files in the prompt without a Pending marker', () => {
    const root = makeRoot('deckent-wave-prompt-');
    const sprintId = 'sprint-675';
    const dependencyId = '675-001';
    const taskId = '675-004';
    const evaluations = join(root, '.deckent', 'runtime', 'evaluations', sprintId);
    mkdirSync(evaluations, { recursive: true });
    writeJson(root, `.tasks/task-${dependencyId}.json`, {
      id: dependencyId, title: 'dependency', description: 'dependency',
      type: 'code-development', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: 'done', noGoCriteria: 'not done' },
      model: 'gpt-5.6-sol', effort: 'medium', priority: 'NORMAL', status: 'DONE',
      sprintId, createdAt: '2026-08-25T00:00:00.000Z',
    });
    const attemptId = 'attempt-dependency-1';
    writeJson(root, `.tasks/task-${dependencyId}.result`, {
      schemaVersion: '1.0', taskId: dependencyId, sprintId, workerId: 'w-675-001',
      filesChanged: [
        { path: 'src/core/alpha.ts', status: 'modified', linesAdded: 2, linesRemoved: 1 },
        { path: 'tests/core/alpha.test.ts', status: 'added', linesAdded: 8, linesRemoved: 0 },
      ],
      totalLinesAdded: 10, totalLinesRemoved: 1,
      workAttribution: {
        state: 'VERIFIED', attemptId, baselineRef: 'baseline-675',
        scopeDigest: createHash('sha256').update('dependency-scope').digest('hex'),
      },
      tests: { passed: 1, failed: 0, total: 1, command: 'vitest', orchestratorVerified: true },
      tsc: { clean: true, errors: 0 }, selfAssessment: 'DONE',
      provider: 'codex', model: 'gpt-5.6-sol',
      tokenUsage: {
        inputTokens: 1, outputTokens: 1, cacheReadTokens: 0,
        cacheCreationTokens: 0, totalTokens: 2, source: 'provider-adapter',
      },
      cost: { usd: 0, currency: 'USD', billingMode: 'subscription', pricingSource: 'none', isLocal: false },
      durationMs: 1, completedAt: '2026-08-25T00:01:00.000Z', notes: 'dependency done',
    });
    writeJson(root, `.deckent/runtime/evaluations/${sprintId}/${dependencyId}-attempt-1.json`, {
      taskId: dependencyId, sprintId, attemptNum: 1, attemptId,
      decision: 'DONE', totalScore: 100,
    });
    const task = {
      id: taskId, title: 'evidence harness', description: 'verify dependency evidence',
      type: 'code-development',
      scope: { directories: ['tests/integration'], filesRead: [], filesWrite: ['tests/integration/event-truth-wave-evidence.test.ts'] },
      dependencies: [dependencyId],
      goNogo: { goCriteria: 'evidence passes', noGoCriteria: 'evidence fails' },
      model: 'gpt-5.6-sol', effort: 'medium', priority: 'NORMAL', status: 'PENDING',
      sprintId, assignedAgent: 'implementer', assignedSkills: [],
      createdAt: '2026-08-25T00:02:00.000Z',
    } as unknown as Task;

    const prompt = buildWorkerPrompt(task, undefined, [], root);

    expect(prompt).toContain('src/core/alpha.ts');
    expect(prompt).toContain('tests/core/alpha.test.ts');
    expect(prompt).not.toContain('(Pending)');
    expect(task.scope.filesRead).toEqual([
      'src/core/alpha.ts',
      'tests/core/alpha.test.ts',
    ]);
  });
});
