import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  runHttpWorkerEntry,
  type HttpAgenticSend,
} from '../../src/agents/http-agentic-worker.js';

const QWEN_IDENTITY = 'Qwen3.8-27B';

describe('http agentic worker — keyless local-llm settlement', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function project(taskId: string): string {
    const root = mkdtempSync(join(tmpdir(), 'http-local-llm-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.tasks', `task-${taskId}.json`), JSON.stringify({
      id: taskId,
      description: 'Write the scoped artifact',
      scope: { directories: [], filesRead: [], filesWrite: ['local-result.ts'] },
      goNogo: { goCriteria: 'scoped artifact written', noGoCriteria: 'no artifact' },
    }));
    return root;
  }

  it('runs the exact Qwen identity without a key and writes guard, heartbeat, usage, result, and settlement', async () => {
    const taskId = 'local-qwen';
    const root = project(taskId);
    let turn = 0;
    const send: HttpAgenticSend = vi.fn(async () => {
      turn += 1;
      if (turn === 1) return {
        content: '',
        toolCalls: [{
          id: 'guarded-write',
          type: 'function',
          function: { name: 'write_file', arguments: JSON.stringify({ path: 'outside.ts', content: 'no' }) },
        }],
        usage: { inputTokens: 7, outputTokens: 3 },
      };
      if (turn === 2) return {
        content: '',
        toolCalls: [{
          id: 'scoped-write',
          type: 'function',
          function: { name: 'write_file', arguments: JSON.stringify({ path: 'local-result.ts', content: 'export const local = true;\n' }) },
        }],
        usage: { inputTokens: 11, outputTokens: 5 },
      };
      return {
        content: '',
        toolCalls: [{
          id: 'settle',
          type: 'function',
          function: { name: 'task_done', arguments: JSON.stringify({ selfAssessment: 'DONE', notes: 'local settled' }) },
        }],
        usage: { inputTokens: 13, outputTokens: 6 },
      };
    });

    const outcome = await runHttpWorkerEntry(
      [taskId, QWEN_IDENTITY, 'http://127.0.0.1:8080/v1', '', 'local-llm'],
      root,
      { send },
    );

    expect(outcome.exitCode).toBe(0);
    expect(existsSync(join(root, 'outside.ts'))).toBe(false);
    expect(readFileSync(join(root, 'local-result.ts'), 'utf8')).toContain('local = true');
    expect(outcome.result.filesChanged).toEqual(['local-result.ts']);
    expect(outcome.result.tokenUsage).toMatchObject({
      inputTokens: 31,
      outputTokens: 14,
      provider: 'local-llm',
      model: QWEN_IDENTITY,
    });
    expect(outcome.result.evaluationDecision).toBe('DONE');
    expect(JSON.parse(readFileSync(outcome.resultPath, 'utf8'))).toEqual(outcome.result);
    expect(JSON.parse(readFileSync(join(root, '.tasks', `task-${taskId}.hb`), 'utf8'))).toMatchObject({
      status: 'DONE',
      taskId,
    });
  });

  it.each([
    ['Linux', 'http://127.0.0.1:8080/v1'],
    ['macOS host adapter', 'http://192.168.65.2:8080/v1'],
    ['Windows native', 'http://127.0.0.1:8080/v1'],
    ['WSL host adapter', 'http://172.29.64.1:8080/v1'],
  ])('preserves the config-resolved %s endpoint on the canonical subprocess path', async (_platform, endpoint) => {
    const taskId = `matrix-${roots.length}`;
    const root = project(taskId);
    const send: HttpAgenticSend = async () => ({ content: 'no mutation', toolCalls: [] });
    const sendFactory = vi.fn(async () => send);

    await runHttpWorkerEntry(
      [taskId, QWEN_IDENTITY, endpoint, '', 'local-llm'],
      root,
      { sendFactory },
    );

    expect(sendFactory).toHaveBeenCalledWith({
      model: QWEN_IDENTITY,
      baseURL: endpoint,
      apiKeyEnv: undefined,
      provider: 'local-llm',
    });
  });
});
