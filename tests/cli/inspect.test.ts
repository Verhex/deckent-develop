import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Command } from 'commander';
import {
  formatInspectTaskDetail,
  registerInspect,
  runInspectCommand,
} from '../../src/cli/commands/inspect.js';

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-inspect-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('deckent inspect', () => {
  it('renders the canonical run listing', async () => {
    const lines: string[] = [];
    const code = await runInspectCommand(undefined, {}, {
      projectRoot: fixtureRoot,
      language: 'en',
      output: (value) => lines.push(value),
      listRuns: () => ({
        schemaVersion: 1,
        runs: [{ runId: 'run-42', lifecycle: 'EXECUTE', source: 'authority', settledAt: null }],
      }),
    });
    expect(code).toBe(0);
    expect(lines[0]).toContain('Run ID\tState\tSource\tSettled at');
    expect(lines[0]).toContain('run-42\tEXECUTE\tauthority\t-');
  });

  it('renders the real core task detail DTO including distinct task and current-run truth', async () => {
    const lines: string[] = [];
    const code = await runInspectCommand('542-003', {}, {
      projectRoot: fixtureRoot,
      language: 'en',
      output: (value) => lines.push(value),
      readTaskDetail: () => ({
        taskId: '542-003',
        task: { id: '542-003', status: 'EXECUTING', assignedAgent: 'terminal-ux-engineer', model: 'model-a' },
        rawTaskProjectionStatus: 'EXECUTING',
        currentRun: { lifecycle: 'ABORTED', status: 'FAILED', reason: 'PROVIDER_BILLING_UNAVAILABLE' },
        hb: { currentAction: 'testing' }, plan: { truncated: false },
        result: { selfAssessment: 'DONE' },
        lineage: {
          logPath: 'task.log', logTailAvailable: true, resultEvidence: null,
          logTail: { lines: ['first', 'last'], truncated: true },
        },
      }),
    });
    expect(code).toBe(0);
    expect(lines[0]).toContain('Task projection status: EXECUTING');
    expect(lines[0]).toContain('Agent: terminal-ux-engineer');
    expect(lines[0]).toContain('Model: model-a');
    expect(lines[0]).toContain('Heartbeat: testing');
    expect(lines[0]).toContain('Plan truncated: false');
    expect(lines[0]).toContain('Self-assessment: DONE');
    expect(lines[0]).toContain('Current run lifecycle: ABORTED');
    expect(lines[0]).toContain('Current run status: FAILED');
    expect(lines[0]).toContain('Current run cause: PROVIDER_BILLING_UNAVAILABLE');
    expect(lines[0]).toContain('Lineage: {"logPath":"task.log"');
    expect(lines[0]).toContain('Log tail (2 lines, truncated: true):\nfirst\nlast');
  });

  it('does not invent current-run truth for a historical task DTO', () => {
    const rendered = formatInspectTaskDetail({
      taskId: '721-001',
      task: { id: '721-001', status: 'FAILED' },
      rawTaskProjectionStatus: 'FAILED',
      currentRun: null,
      hb: null,
      plan: null,
      result: null,
      lineage: {},
    }, 'en');
    expect(rendered).toContain('Task projection status: FAILED');
    expect(rendered).toContain('Current run lifecycle: -');
    expect(rendered).toContain('Current run status: -');
    expect(rendered).toContain('Current run cause: -');
  });

  it('returns typed exit 1 for an unknown task', async () => {
    const lines: string[] = [];
    const code = await runInspectCommand('missing', {}, {
      projectRoot: fixtureRoot,
      language: 'en',
      output: (value) => lines.push(value),
      readTaskDetail: () => null,
    });
    expect(code).toBe(1);
    expect(lines).toEqual(['INSPECT_TASK_NOT_FOUND: Unknown task ID: missing']);
  });

  it('preserves listing and detail machine shapes with --json', async () => {
    const listing = { schemaVersion: 1, generatedAt: 'now', revision: 'r1', runs: [] };
    const detail = {
      schemaVersion: 1, taskId: '542-003',
      lineage: { logPath: 'task.log', logTail: { lines: ['verbatim'], truncated: false } },
    };
    const output: string[] = [];
    await runInspectCommand(undefined, { json: true }, {
      projectRoot: fixtureRoot, output: (value) => output.push(value), listRuns: () => listing,
    });
    await runInspectCommand('542-003', { json: true }, {
      projectRoot: fixtureRoot, output: (value) => output.push(value), readTaskDetail: () => detail,
    });
    expect(JSON.parse(output[0] ?? '')).toEqual(listing);
    expect(JSON.parse(output[1] ?? '')).toEqual(detail);
  });

  it('follows snapshot revisions and disposes the observer on close', async () => {
    const output: string[] = [];
    const listeners = new Map<string, () => void>();
    let emit: ((snapshot: unknown) => void) | undefined;
    let closeCount = 0;
    const running = runInspectCommand(undefined, { follow: true }, {
      projectRoot: fixtureRoot,
      language: 'en',
      output: (value) => output.push(value),
      listRuns: () => ({ runs: [{ runId: 'run-1', lifecycle: 'EXECUTE' }] }),
      observeSnapshot: (_root, onSnapshot) => {
        emit = onSnapshot;
        return { close: () => { closeCount += 1; } };
      },
      followSignals: {
        on: (event, listener) => { listeners.set(event, listener); },
        off: (event) => { listeners.delete(event); },
      },
    });
    await Promise.resolve();
    emit?.({ lifecycle: { lifecycle: 'ACTIVE' }, phase: 'RUNNING', workers: [{ taskId: '1' }], revision: 7 });
    expect(output[0]).toContain('Run ID\tState');
    expect(output[1]).toBe('\r\u001b[2KLifecycle: ACTIVE · phase: RUNNING · workers: 1 · revision: 7');
    listeners.get('close')?.();
    expect(await running).toBe(0);
    expect(closeCount).toBe(1);
    expect(listeners.size).toBe(0);
  });

  it('follows one task status and heartbeat on each revision', async () => {
    const output: string[] = [];
    const listeners = new Map<string, () => void>();
    let emit: ((snapshot: unknown) => void) | undefined;
    const running = runInspectCommand('544-003', { follow: true }, {
      projectRoot: fixtureRoot,
      language: 'en',
      output: (value) => output.push(value),
      readTaskDetail: () => ({
        taskId: '544-003', task: {}, rawTaskProjectionStatus: 'EXECUTING', hb: null, lineage: {},
        currentRun: {
          sprintId: 'sprint-544', lifecycle: 'ACTIVE', status: 'EXECUTING', reason: null,
        },
      }),
      observeSnapshot: (_root, onSnapshot) => {
        emit = onSnapshot;
        return { close() {} };
      },
      followSignals: {
        on: (event, listener) => { listeners.set(event, listener); },
        off: (event) => { listeners.delete(event); },
      },
    });
    await Promise.resolve();
    emit?.({
      revision: 8,
      lifecycle: { sprintId: 'sprint-544', lifecycle: 'ACTIVE', status: 'EXECUTING', reason: null },
      workers: [{ taskId: '544-003', status: 'EXECUTING', hb: { currentAction: 'testing' } }],
    });
    expect(output[1]).toBe(
      '\r\u001b[2KTask 544-003 · status: EXECUTING · heartbeat: testing · current run: ACTIVE/EXECUTING · cause: - · revision: 8',
    );
    emit?.({
      revision: 9,
      lifecycle: { sprintId: 'sprint-544', lifecycle: 'ABORTED', status: 'FAILED', reason: 'PROVIDER_BILLING_UNAVAILABLE' },
      workers: [{ taskId: '544-003', status: 'EXECUTING', hb: { currentAction: 'settling' } }],
    });
    expect(output[2]).toBe(
      '\r\u001b[2KTask 544-003 · status: EXECUTING · heartbeat: settling · current run: ABORTED/FAILED · cause: PROVIDER_BILLING_UNAVAILABLE · revision: 9',
    );
    emit?.({
      revision: 10,
      lifecycle: { sprintId: 'sprint-545', lifecycle: 'ACTIVE', status: 'EXECUTING', reason: null },
      workers: [{ taskId: '544-003', status: 'EXECUTING', hb: { currentAction: 'stale' } }],
    });
    expect(output[3]).toBe(
      '\r\u001b[2KTask 544-003 · status: EXECUTING · heartbeat: stale · revision: 10',
    );
    listeners.get('SIGINT')?.();
    expect(await running).toBe(0);
  });

  it('registers a help-visible inspect command with JSON and follow options', () => {
    const program = new Command().name('deckent');
    registerInspect(program, { projectRoot: fixtureRoot, language: 'tr' });
    const command = program.commands.find((candidate) => candidate.name() === 'inspect');
    expect(command).toBeDefined();
    expect(command?.description()).toContain('Canonical');
    expect(command?.options.map((option) => option.long)).toContain('--json');
    expect(command?.options.map((option) => option.long)).toContain('--follow');
  });
});
