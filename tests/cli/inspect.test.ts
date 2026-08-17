import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Command } from 'commander';
import {
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

  it('renders task drill-down including lineage', async () => {
    const lines: string[] = [];
    const code = await runInspectCommand('542-003', {}, {
      projectRoot: fixtureRoot,
      language: 'en',
      output: (value) => lines.push(value),
      readTaskDetail: () => ({
        taskId: '542-003', status: 'EXECUTING', agent: 'terminal-ux-engineer', model: 'model-a',
        heartbeat: { currentAction: 'testing' }, plan: { truncated: false },
        result: { selfAssessment: 'DONE' },
        lineage: { logPath: null, logTailAvailable: false, resultEvidence: null },
      }),
    });
    expect(code).toBe(0);
    expect(lines[0]).toContain('Status: EXECUTING');
    expect(lines[0]).toContain('Heartbeat: testing');
    expect(lines[0]).toContain('Plan truncated: false');
    expect(lines[0]).toContain('Self-assessment: DONE');
    expect(lines[0]).toContain('Lineage: {"logPath":null');
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
    const detail = { schemaVersion: 1, taskId: '542-003', lineage: { logPath: 'task.log' } };
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

  it('registers a help-visible inspect command and JSON option', () => {
    const program = new Command().name('deckent');
    registerInspect(program, { projectRoot: fixtureRoot, language: 'tr' });
    const command = program.commands.find((candidate) => candidate.name() === 'inspect');
    expect(command).toBeDefined();
    expect(command?.description()).toContain('Canonical');
    expect(command?.options.map((option) => option.long)).toContain('--json');
  });
});
