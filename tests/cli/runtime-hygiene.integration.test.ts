import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { appendFlowEvents } from '../../src/core/run-flow-store.js';
import type { RunFlowEvent } from '../../src/core/run-flow-contract.js';
import { MemoryStore } from '../../src/core/memory-store.js';

const ENTRY = resolve('dist/cli/entry.js');

interface BinaryResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface TreeEntry {
  path: string;
  kind: 'directory' | 'file';
  bytes?: number;
  sha256?: string;
}

async function runBinary(root: string, args: readonly string[]): Promise<BinaryResult> {
  return await new Promise<BinaryResult>((resolveResult, rejectResult) => {
    const env = { ...process.env, NO_COLOR: '1', DECKENT_OFFLINE: '1' };
    for (const name of [
      'VITEST', 'VITEST_POOL_ID', 'VITEST_WORKER_ID', 'NODE_ENV',
      'DECKENT_TEST_HERMETICITY', 'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE',
    ]) delete env[name];
    const child = spawn(process.execPath, [ENTRY, ...args], {
      cwd: root,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', rejectResult);
    child.once('close', code => resolveResult({ code: code ?? 1, stdout, stderr }));
  });
}

function write(root: string, path: string, contents: string): void {
  const target = join(root, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, contents, 'utf8');
}

function tree(root: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const path = relative(root, absolute).split('\\').join('/');
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        entries.push({ path, kind: 'directory' });
        visit(absolute);
      } else {
        const bytes = readFileSync(absolute);
        entries.push({
          path,
          kind: 'file',
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
  };
  visit(root);
  return entries;
}

function json(result: BinaryResult): Record<string, unknown> {
  expect(result.code, JSON.stringify(result)).toBe(0);
  expect(result.stderr, JSON.stringify(result)).toBe('');
  return JSON.parse(result.stdout.trim()) as Record<string, unknown>;
}

function terminalFlow(flowId: string): RunFlowEvent[] {
  const timestamp = '2026-01-01T00:00:00.000Z';
  const planDigest = 'd'.repeat(64);
  return [
    {
      schemaVersion: 1, type: 'PROPOSAL_SUBMITTED', flowId, timestamp,
      proposal: {
        flowId, revision: 1, intentSummary: 'runtime hygiene fixture',
        tenant: 'tenant-rh18', project: 'project-rh18', actor: { id: 'operator-rh18' }, origin: 'cli',
      },
    },
    { schemaVersion: 1, type: 'PREVIEW_STARTED', flowId, timestamp, revision: 1 },
    {
      schemaVersion: 1, type: 'PREVIEW_READY', flowId, timestamp,
      preview: {
        flowId, revision: 1, planDigest, taskSummaries: [],
        policyDecision: 'allow', gateResult: 'pass',
      },
    },
    {
      schemaVersion: 1, type: 'APPROVAL_GRANTED', flowId, timestamp,
      revision: 1, planDigest, approvedBy: { id: 'operator-rh18' },
    },
    { schemaVersion: 1, type: 'START_REQUESTED', flowId, timestamp, revision: 1, planDigest },
    {
      schemaVersion: 1, type: 'RUN_STARTED', flowId, timestamp,
      handle: { flowId, jobId: 'job-rh18', logRef: 'log-rh18' },
    },
    { schemaVersion: 1, type: 'RUN_COMPLETED', flowId, timestamp, summary: 'complete' },
  ];
}

describe('runtime hygiene — real compiled binary lifecycle', () => {
  it('inventories read-only, retires losslessly, then replays the durable receipt in a fresh process', async () => {
    expect(existsSync(ENTRY), 'the compiled CLI is mandatory evidence for RH18').toBe(true);
    const root = mkdtempSync(join(tmpdir(), 'deckent-runtime-hygiene-binary-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));

    write(root, 'package.json', '{"name":"runtime-hygiene-fixture","version":"1.0.0"}\n');
    write(root, '.deckent/config.json', '{"language":"en"}\n');
    write(
      root,
      '.deckent/recently-works/sprint-479-recovery-not-dispatched.json',
      'new-recovery-evidence\n',
    );
    write(
      root,
      '.deckent/archive/sprints/sprint-479/sprint-479-recovery-not-dispatched.json',
      'prior-recovery-evidence\n',
    );
    write(root, '.tasks/task-479-active.log', 'active-log-must-stay\n');
    write(root, '.tasks/task-479-active.hb', JSON.stringify({
      workerId: 'w-479-active', status: 'EXECUTING', timestamp: new Date().toISOString(),
    }));
    write(
      root,
      '.deckent/runtime/evaluations/sprint-479/479-001/479-001-attempt-1.json',
      '{"decision":"DONE"}\n',
    );
    write(
      root,
      '.deckent/runtime/evaluations/sprint-479/479-002-attempt-1.json',
      'new-evaluation-conflict\n',
    );
    write(
      root,
      '.deckent/archive/sprints/sprint-479/evaluations/479-002-attempt-1.json',
      'prior-evaluation-conflict\n',
    );
    appendFlowEvents(root, 'terminal-rh18', terminalFlow('terminal-rh18'));
    write(root, '.deckent/runtime/telegram-bot.log', 'deduplicated-bot-log\n');
    write(root, '.deckent/runtime/discord-bot.log', 'deduplicated-bot-log\n');
    write(root, '.deckent/runtime/slack-bot.log', 'fresh-bot-log-must-stay\n');
    mkdirSync(join(root, '.brain'), { recursive: true });
    const memory = new MemoryStore(join(root, '.brain', 'memory.db'));
    memory.close();
    write(root, '.deckent/auth/token.json', 'token-bytes-must-stay\n');
    write(root, '.deckent/archive/runtime-hygiene/staging/named-interrupted/item', 'staging-must-stay\n');

    const old = new Date('2020-01-01T00:00:00.000Z');
    for (const path of [
      '.deckent/runtime/telegram-bot.log', '.deckent/runtime/discord-bot.log',
    ]) utimesSync(join(root, path), old, old);

    const seeded = tree(root);
    const inventory = json(await runBinary(root, [
      'cleanup', '--history', '--sprint', 'sprint-479', '--json',
    ]));
    expect(inventory).toMatchObject({ operation: 'runtime-hygiene', mode: 'plan' });
    expect(tree(root)).toEqual(seeded);

    const dryRun = json(await runBinary(root, [
      'cleanup', '--history', '--sprint', 'sprint-479', '--dry-run', '--json',
    ]));
    expect(dryRun).toEqual(inventory);
    expect(tree(root)).toEqual(seeded);

    const planDigest = inventory['planDigest'];
    expect(planDigest).toMatch(/^[a-f0-9]{64}$/u);
    const applied = json(await runBinary(root, [
      'cleanup', '--history', '--sprint', 'sprint-479',
      '--apply', '--plan-digest', String(planDigest), '--json',
    ]));
    expect(applied).toMatchObject({
      operation: 'runtime-hygiene', mode: 'apply',
      receipt: { state: 'published', status: 'complete' },
    });
    const afterApply = tree(root);
    expect(afterApply).not.toEqual(seeded);

    for (const survivor of [
      '.tasks/task-479-active.log', '.tasks/task-479-active.hb', '.brain/memory.db',
      '.deckent/auth/token.json',
      '.deckent/archive/runtime-hygiene/staging/named-interrupted/item',
      '.deckent/runtime/slack-bot.log',
      '.deckent/runtime/evaluations/sprint-479/479-002-attempt-1.json',
      '.deckent/archive/sprints/sprint-479/evaluations/479-002-attempt-1.json',
    ]) expect(readFileSync(join(root, survivor), 'utf8')).toBeDefined();
    for (const retired of [
      '.deckent/recently-works/sprint-479-recovery-not-dispatched.json',
      '.deckent/runtime/evaluations/sprint-479/479-001/479-001-attempt-1.json',
      '.deckent/runtime/run-flow-store/terminal-rh18.events.jsonl',
      '.deckent/runtime/telegram-bot.log', '.deckent/runtime/discord-bot.log',
    ]) expect(existsSync(join(root, retired)), retired).toBe(false);
    expect(readFileSync(
      join(root, '.deckent/archive/sprints/sprint-479/sprint-479-recovery-not-dispatched.json'),
      'utf8',
    )).toBe('prior-recovery-evidence\n');

    const maintenanceManifests = afterApply
      .filter(entry => entry.kind === 'file'
        && entry.path.startsWith('.deckent/archive/runtime-artifacts/objects/sha256/')
        && entry.path.includes('/manifests/'))
      .map(entry => JSON.parse(readFileSync(join(root, entry.path), 'utf8')) as {
        source: string; contentPath: string;
      });
    const botManifests = maintenanceManifests.filter(item =>
      item.source === '.deckent/runtime/telegram-bot.log'
      || item.source === '.deckent/runtime/discord-bot.log');
    expect(botManifests).toHaveLength(2);
    expect(new Set(botManifests.map(item => item.contentPath))).toHaveLength(1);

    const replay = json(await runBinary(root, [
      'cleanup', '--history', '--sprint', 'sprint-479',
      '--apply', '--plan-digest', String(planDigest), '--json',
    ]));
    expect(replay).toEqual({
      ...applied,
      receipt: { state: 'existing', status: 'complete' },
    });
    expect(tree(root)).toEqual(afterApply);
  }, 30_000);
});
