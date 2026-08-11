import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerTraceExtract } from '../../src/cli/commands/trace-extract.js';

const roots: string[] = [];

afterEach(async () => {
  process.exitCode = undefined;
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function projectFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'trace-cli-'));
  roots.push(root);
  await mkdir(join(root, '.deckent', 'traces'), { recursive: true });
  const records = [
    {
      schemaVersion: 2,
      messages: [
        { role: 'user', content: 'Inspect the repository contract.' },
        { role: 'assistant', content: 'The contract is consistent.' },
      ],
      meta: {
        source: 'sprint-worker',
        schemaVersion: 2,
        sprintId: 'sprint-fixture',
        taskId: 'fixture-001',
        attemptId: 'fixture-attempt-001',
        verdict: 'GO',
        verdictAuthorityRef: 'fixture-evaluator-result',
      },
    },
  ];
  await writeFile(
    join(root, '.deckent', 'traces', 'sprint-worker.jsonl'),
    records.map(record => JSON.stringify(record)).join('\n') + '\n',
  );
  return root;
}

async function runCli(root: string, args: string[]): Promise<string> {
  const chunks: string[] = [];
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  try {
    const program = new Command();
    program.exitOverride();
    registerTraceExtract(program, { resolveProjectRootFn: () => root });
    await program.parseAsync(['node', 'deckent', ...args]);
  } finally {
    stdout.mockRestore();
  }
  return chunks.join('').trim();
}

describe('deckent trace canonical CLI', () => {
  it('keeps migrate dry-run side-effect free and returns stable machine-readable evidence', async () => {
    const root = await projectFixture();
    const args = [
      'trace', 'migrate', '.deckent/traces/sprint-worker.jsonl',
      '--out', '.deckent/training/migrations/fixture',
      '--allow-training', '--json',
    ];

    const first = JSON.parse(await runCli(root, args));
    const second = JSON.parse(await runCli(root, args));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaVersion: 1,
      command: 'trace.migrate',
      ok: true,
      mode: 'dry-run',
      status: 'dry-run',
      manifest: { inventory: { projectedRecords: 1 } },
    });
    expect(existsSync(join(root, '.deckent', 'training'))).toBe(false);
  });

  it('publishes an idempotent migration, builds a canonical corpus, and lints its manifest', async () => {
    const root = await projectFixture();
    const migration = '.deckent/training/migrations/fixture';
    const corpus = '.deckent/training/corpus/fixture.sharegpt.jsonl';
    const migrateArgs = [
      'trace', 'migrate', '.deckent/traces', '--out', migration,
      '--apply', '--allow-training', '--weight', '1', '--json',
    ];

    const applied = JSON.parse(await runCli(root, migrateArgs));
    const replay = JSON.parse(await runCli(root, migrateArgs));
    expect(applied.status).toBe('published');
    expect(replay.status).toBe('noop');
    expect(replay.manifest.migrationId).toBe(applied.manifest.migrationId);

    const built = JSON.parse(await runCli(root, [
      'trace', 'corpus', 'build', migration, '--out', corpus, '--json',
    ]));
    expect(built).toMatchObject({
      schemaVersion: 1,
      command: 'trace.corpus.build',
      ok: true,
      pipeline: { examplesWritten: 1, policyRejectedCount: 0 },
      lint: { ok: true, violations: [] },
    });

    const linted = JSON.parse(await runCli(root, [
      'trace', 'corpus', 'lint', corpus, '--json',
    ]));
    expect(linted).toMatchObject({
      schemaVersion: 1,
      command: 'trace.corpus.lint',
      ok: true,
      report: { ok: true, violations: [], stats: { validExamples: 1 } },
    });

    const stored = JSON.parse((await readFile(join(root, corpus), 'utf8')).trim());
    expect(stored.provenance).toMatchObject({
      migrationId: applied.manifest.migrationId,
      disposition: 'train-ready',
      integrity: 'verified',
    });
  });

  it('fails closed when a positive weight is requested without training admission', async () => {
    const root = await projectFixture();
    const output = JSON.parse(await runCli(root, [
      'trace', 'migrate', '.deckent/traces', '--weight', '2', '--json',
    ]));
    expect(output).toMatchObject({
      command: 'trace.migrate',
      ok: false,
      error: { code: 'PATH_AUTHORITY_INVALID' },
    });
    expect(process.exitCode).toBe(1);
  });
});
