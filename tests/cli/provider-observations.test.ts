import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import Database from 'better-sqlite3';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

const output = vi.hoisted(() => ({ print: vi.fn(), printError: vi.fn() }));
vi.mock('../../src/cli/helpers/output.js', () => output);
vi.mock('../../src/cli/helpers/messages.js', () => ({
  getLanguage: () => 'en',
  getMessage: (key: string, _lang: string, vars?: Record<string, string>) =>
    key + (vars ? ':' + JSON.stringify(vars) : ''),
}));

import {
  providerObservationJson,
  registerProviderObservations,
  type ProviderObservationMigrationProjection,
} from '../../src/cli/commands/provider-observations.js';
import { PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH } from '../../src/core/provider-execution-observation-store.js';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

function createProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'provider-observation-cli-'));
  temporaryDirectories.push(root);
  mkdirSync(join(root, '.deckent'));
  chmodSync(join(root, '.deckent'), 0o700);
  return root;
}

function createDatabase(path: string, version: 1 | 2, corrupt = false): void {
  if (corrupt) {
    writeFileSync(path, 'not a sqlite database: /home/private-owner');
    return;
  }
  const db = new Database(path);
  db.exec(`
    CREATE TABLE provider_execution_contradictions (
      contradiction_id INTEGER PRIMARY KEY,
      principal_digest TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE provider_execution_intervals (
      execution_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      principal_digest TEXT NOT NULL,
      fence TEXT NOT NULL,
      start_json TEXT NOT NULL,
      end_json TEXT,
      start_sequence INTEGER NOT NULL,
      end_sequence INTEGER${version === 2 ? ', run_id TEXT, retired INTEGER NOT NULL DEFAULT 0' : ''}
    );
    ${version === 2 ? `CREATE INDEX idx_provider_execution_run_scope
      ON provider_execution_intervals (run_id, attempt_id, principal_digest, fence, retired, start_sequence, execution_id);` : ''}
    PRAGMA user_version = ${version};
  `);
  db.prepare(`INSERT INTO provider_execution_intervals
    (execution_id, task_id, attempt_id, principal_digest, fence, start_json,
     end_json, start_sequence, end_sequence${version === 2 ? ', run_id, retired' : ''})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${version === 2 ? ', ?, ?' : ''})`).run(
    'execution-secret', 'task-secret', 'attempt-secret', 'principal-secret',
    'fence-secret', '{"state":"started"}', '{"state":"ended"}', 1, 2,
    ...(version === 2 ? [null, 0] : []),
  );
  db.close();
}

async function runProductionCommand(root: string, args: readonly string[]) {
  const script = join(root, 'provider-observations-driver.ts');
  const modulePath = join(process.cwd(), 'src/cli/commands/provider-observations.ts');
  const commanderPath = join(process.cwd(), 'node_modules/commander/index.js');
  writeFileSync(script, [
    `import { Command } from ${JSON.stringify(commanderPath)};`,
    `import { registerProviderObservations } from ${JSON.stringify(modulePath)};`,
    `const program = new Command().exitOverride();`,
    `registerProviderObservations(program, { resolveProjectRootFn: () => process.env.PROJECT_ROOT! });`,
    `await program.parseAsync(['node', 'deckent', ...JSON.parse(process.env.COMMAND_ARGS!)]);`,
  ].join('\n'));
  try {
    return await execFileAsync(join(process.cwd(), 'node_modules/.bin/vite-node'), [script], {
      cwd: root,
      env: { ...process.env, PROJECT_ROOT: root, COMMAND_ARGS: JSON.stringify(args) },
    });
  } catch (error) {
    return error as Awaited<ReturnType<typeof execFileAsync>> & { code: number };
  }
}

function fixture(root: string): ProviderObservationMigrationProjection {
  const digestA = 'a'.repeat(64);
  const digestB = 'b'.repeat(64);
  return {
    operation: 'migration',
    mode: 'dry-run',
    inspection: {
      state: 'migration-required',
      sourceSchemaVersion: 1,
      targetSchemaVersion: 2,
      schemaDigest: digestA,
      rowLineageDigest: digestB,
      rowCount: 2,
      databaseBytes: 512,
    },
    plan: {
      version: 1,
      migrationId: 'migration-stable',
      projectPath: {
        projectRoot: root,
        relativeDatabasePath: '.deckent/provider-execution-observations.db',
        databasePath: join(root, '.deckent/provider-execution-observations.db'),
      },
      sourceSchemaVersion: 1,
      targetSchemaVersion: 2,
      sourceSchemaDigest: digestA,
      sourceRowLineageDigest: digestB,
      sourceRowCount: 2,
      sourceDatabaseBytes: 512,
      plannedAt: '1970-01-01T00:00:00.000Z',
      planDigest: 'c'.repeat(64),
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('provider observations CLI wiring', () => {
  it('consumes the core canonical database default without declaring a local path authority', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/cli/commands/provider-observations.ts'),
      'utf8',
    );

    expect(source).not.toContain('const DEFAULT_DATABASE_PATH');
    expect(source).toContain('database ?? PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH');
  });

  it('renders byte-stable redacted aggregate JSON without the absolute root or raw identity', () => {
    const root = '/tmp/private-project-owner-identity';
    const projection = fixture(root);
    const first = providerObservationJson(projection, root);
    const second = providerObservationJson(projection, root);

    expect(first).toBe(second);
    expect(first).not.toContain(root);
    expect(first).not.toContain('private-project-owner-identity');
    expect(JSON.parse(first)).toEqual(expect.objectContaining({
      mode: 'dry-run',
      operation: 'migration',
      inspection: expect.objectContaining({ rowCount: 2 }),
      plan: expect.objectContaining({
        relativeDatabasePath: '.deckent/provider-execution-observations.db',
        planDigest: 'c'.repeat(64),
      }),
    }));
  });

  it('wires inspect and migrate to the exact typed handler and stays dry-run by default', async () => {
    const root = '/tmp/provider-observation-project';
    const inspect = vi.fn(async () => ({ ...fixture(root), mode: 'inspect' as const, plan: undefined }));
    const migrate = vi.fn(async () => fixture(root));
    const program = new Command().exitOverride();
    registerProviderObservations(program, {
      resolveProjectRootFn: () => root,
      inspect,
      migrate,
    });

    await program.parseAsync(['node', 'deckent', 'provider-observations', 'inspect', '--json']);
    expect(inspect).toHaveBeenCalledWith(root, expect.not.objectContaining({ apply: true }));
    expect(output.print).toHaveBeenCalledWith(providerObservationJson({
      ...fixture(root), mode: 'inspect', plan: undefined,
    }, root));

    vi.clearAllMocks();
    await program.parseAsync(['node', 'deckent', 'provider-observations', 'migrate', '--json']);
    expect(migrate).toHaveBeenCalledWith(root, expect.not.objectContaining({ apply: true }));
  });

  it('executes production inspect and dry-run handlers in real asynchronous child processes', async () => {
    const root = createProject();
    const databasePath = join(root, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH);
    createDatabase(databasePath, 1);
    const before = readFileSync(databasePath);
    const [one, two] = await Promise.all([
      runProductionCommand(root, ['provider-observations', 'inspect', '--json']),
      runProductionCommand(root, ['provider-observations', 'inspect', '--json']),
    ]);
    expect(one.stderr).toBe('');
    expect(two.stderr).toBe('');
    expect(one.stdout).toBe(two.stdout);
    expect(one.stdout).not.toContain(root);
    expect(one.stdout).not.toMatch(/principal|execution_id|task_id|attempt_id/i);
    expect(JSON.parse(one.stdout)).toMatchObject({
      mode: 'inspect', operation: 'migration', inspection: { rowCount: 1, state: 'migration-required' },
    });
    expect(readdirSync(join(root, '.deckent'))).toEqual(['provider-execution-observations.db']);

    const [dryOne, dryTwo] = await Promise.all([
      runProductionCommand(root, ['provider-observations', 'migrate', '--json']),
      runProductionCommand(root, ['provider-observations', 'migrate', '--json']),
    ]);
    expect(dryOne.stdout).toBe(dryTwo.stdout);
    expect(JSON.parse(dryOne.stdout)).toMatchObject({
      mode: 'dry-run', operation: 'migration', plan: {
        relativeDatabasePath: PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH,
        plannedAt: '1970-01-01T00:00:00.000Z',
      },
    });
    expect(readFileSync(databasePath)).toEqual(before);
    expect(dryOne.stdout).not.toMatch(/principal-secret|execution-secret|task-secret|attempt-secret/);
  });

  it.each([
    ['absolute', ['/tmp/outside.sqlite'], 'INVALID_PATH'],
    ['escape', ['../outside.sqlite'], 'PATH_ESCAPE'],
  ] as const)('rejects %s database paths with stable redacted JSON', async (_name, [path], code) => {
    const root = createProject();
    const result = await runProductionCommand(root, [
      'provider-observations', 'inspect', '--database', path, '--json',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ code, mode: 'error', operation: 'inspect' });
    expect(result.stdout).not.toContain(root);
    expect(result.stdout).not.toContain(path);
  });

  it('keeps a valid explicit database override readable and side-effect free', async () => {
    const root = createProject();
    const databasePath = join(root, '.deckent/explicit.sqlite');
    createDatabase(databasePath, 1);
    const before = readFileSync(databasePath);
    const result = await runProductionCommand(root, [
      'provider-observations', 'inspect', '--database', '.deckent/explicit.sqlite', '--json',
    ]);

    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'inspect', operation: 'migration', inspection: { rowCount: 1 },
    });
    expect(readFileSync(databasePath)).toEqual(before);
    expect(readdirSync(join(root, '.deckent'))).toEqual(['explicit.sqlite']);
  });

  it('fails closed on corrupt and symlink databases without leaking exception paths', async () => {
    const root = createProject();
    const corrupt = join(root, '.deckent/corrupt.sqlite');
    createDatabase(corrupt, 1, true);
    const externalRoot = createProject();
    const external = join(externalRoot, '.deckent/external.sqlite');
    createDatabase(external, 1);
    symlinkSync(external, join(root, '.deckent/link.sqlite'));

    const corruptResult = await runProductionCommand(root, [
      'provider-observations', 'inspect', '--database', '.deckent/corrupt.sqlite', '--json',
    ]);
    const linkResult = await runProductionCommand(root, [
      'provider-observations', 'inspect', '--database', '.deckent/link.sqlite', '--json',
    ]);
    expect(corruptResult.code).toBe(1);
    expect(JSON.parse(corruptResult.stdout)).toMatchObject({ mode: 'error', operation: 'inspect' });
    expect(linkResult.code).toBe(1);
    expect(JSON.parse(linkResult.stdout)).toEqual({ code: 'SYMLINK_PATH', mode: 'error', operation: 'inspect' });
    expect(corruptResult.stdout + linkResult.stdout).not.toContain(root);
    expect(corruptResult.stdout + linkResult.stdout).not.toContain(externalRoot);
    expect(corruptResult.stdout + linkResult.stdout).not.toContain('private-owner');
  });

  it('runs production adoption through durable publish, exact fresh-read, and deduplicated replay', async () => {
    const root = createProject();
    const sourcePath = join(root, '.deckent/preimage.sqlite');
    const targetPath = join(root, '.deckent/provider-execution-observations.db');
    createDatabase(sourcePath, 1);
    createDatabase(targetPath, 2);
    const sourceBefore = readFileSync(sourcePath);
    const targetBefore = readFileSync(targetPath);
    const dry = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite', '--json',
    ]);
    const planDigest = (JSON.parse(dry.stdout) as { plan: { planDigest: string } }).plan.planDigest;
    expect(readdirSync(join(root, '.deckent')).sort()).toEqual([
      'preimage.sqlite', 'provider-execution-observations.db',
    ]);
    const persisted = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite',
      '--apply', '--plan-digest', planDigest, '--json',
    ]);
    expect(JSON.parse(dry.stdout)).toMatchObject({ mode: 'dry-run', operation: 'adoption' });
    const persistedJson = JSON.parse(persisted.stdout) as {
      mode: string;
      receipt: { receiptId: string; projectRelativeReceiptPath: string; sourceProjectRelativePath: string; targetProjectRelativePath: string };
    };
    expect(persistedJson).toMatchObject({
      mode: 'persisted', operation: 'adoption', receipt: {
        databaseMutation: 'none', adoptedLegacyRowCount: 1, runOwnedRowCount: 0,
        sourceProjectRelativePath: '.deckent/preimage.sqlite',
        targetProjectRelativePath: '.deckent/provider-execution-observations.db',
      },
    });
    expect(persisted.stdout).not.toContain(root);
    expect(persisted.stdout).not.toMatch(/principal-secret|execution-secret|task-secret|attempt-secret/);
    expect(existsSync(join(root, persistedJson.receipt.projectRelativeReceiptPath))).toBe(true);
    const durableBytes = readFileSync(join(root, persistedJson.receipt.projectRelativeReceiptPath), 'utf8');
    expect(JSON.parse(durableBytes)).toMatchObject({ receiptId: persistedJson.receipt.receiptId });
    expect(durableBytes).not.toContain(root);
    expect(durableBytes).not.toMatch(/principal-secret|execution-secret|task-secret|attempt-secret/);

    const replay = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite',
      '--apply', '--plan-digest', planDigest, '--json',
    ]);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      mode: 'replay', receipt: { receiptId: persistedJson.receipt.receiptId },
    });
    expect((JSON.parse(replay.stdout) as { receipt: unknown }).receipt).toEqual(persistedJson.receipt);
    const receiptDirectory = join(root, persistedJson.receipt.projectRelativeReceiptPath, '..');
    expect(readdirSync(receiptDirectory).filter(name => name.endsWith('.json'))).toHaveLength(1);
    expect(readFileSync(join(root, persistedJson.receipt.projectRelativeReceiptPath), 'utf8')).toBe(durableBytes);
    expect(readFileSync(sourcePath)).toEqual(sourceBefore);
    expect(readFileSync(targetPath)).toEqual(targetBefore);
  });

  it('refuses a plan made stale by a source change without writing a receipt', async () => {
    const root = createProject();
    const sourcePath = join(root, '.deckent/preimage.sqlite');
    const targetPath = join(root, '.deckent/provider-execution-observations.db');
    createDatabase(sourcePath, 1);
    createDatabase(targetPath, 2);
    const dry = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite', '--json',
    ]);
    const staleDigest = (JSON.parse(dry.stdout) as { plan: { planDigest: string } }).plan.planDigest;
    const source = new Database(sourcePath);
    source.pragma('application_id = 1780659451');
    source.close();
    const sourceBeforeApply = readFileSync(sourcePath);
    const targetBeforeApply = readFileSync(targetPath);
    const result = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite',
      '--apply', '--plan-digest', staleDigest, '--json',
    ]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      code: 'PLAN_DIGEST_MISMATCH', mode: 'error', operation: 'adoption',
    });
    expect(readdirSync(join(root, '.deckent')).sort()).toEqual([
      'preimage.sqlite', 'provider-execution-observations.db',
    ]);
    expect(readFileSync(sourcePath)).toEqual(sourceBeforeApply);
    expect(readFileSync(targetPath)).toEqual(targetBeforeApply);
  });

  it('returns a redacted HOLD for a non-empty WAL and performs zero writes', async () => {
    const root = createProject();
    const sourcePath = join(root, '.deckent/preimage.sqlite');
    const targetPath = join(root, '.deckent/provider-execution-observations.db');
    createDatabase(sourcePath, 1);
    createDatabase(targetPath, 2);
    const sourceBefore = readFileSync(sourcePath);
    const targetBefore = readFileSync(targetPath);
    writeFileSync(`${targetPath}-wal`, 'principal-secret:/home/private-owner');

    const result = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite', '--json',
    ]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: 'hold', operation: 'adoption' });
    expect(result.stdout).not.toContain(root);
    expect(result.stdout).not.toMatch(/principal-secret|private-owner/);
    expect(readFileSync(sourcePath)).toEqual(sourceBefore);
    expect(readFileSync(targetPath)).toEqual(targetBefore);
  });

  it('fails closed with a redacted HOLD when the independently persisted receipt is malformed', async () => {
    const root = createProject();
    const sourcePath = join(root, '.deckent/preimage.sqlite');
    const targetPath = join(root, '.deckent/provider-execution-observations.db');
    createDatabase(sourcePath, 1);
    createDatabase(targetPath, 2);
    const dry = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite', '--json',
    ]);
    const planDigest = (JSON.parse(dry.stdout) as { plan: { planDigest: string } }).plan.planDigest;
    const applied = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite',
      '--apply', '--plan-digest', planDigest, '--json',
    ]);
    const appliedJson = JSON.parse(applied.stdout) as {
      receipt: { projectRelativeReceiptPath: string };
    };
    const receiptPath = join(root, appliedJson.receipt.projectRelativeReceiptPath);
    const sourceBefore = readFileSync(sourcePath);
    const targetBefore = readFileSync(targetPath);
    writeFileSync(receiptPath, '{"identity":"principal-secret:/home/private-owner"}');

    const replay = await runProductionCommand(root, [
      'provider-observations', 'adopt', '--preimage', '.deckent/preimage.sqlite',
      '--apply', '--plan-digest', planDigest, '--json',
    ]);

    expect(replay.code).toBe(1);
    expect(JSON.parse(replay.stdout)).toMatchObject({ mode: 'hold', operation: 'adoption' });
    expect(replay.stdout).not.toContain(root);
    expect(replay.stdout).not.toMatch(/principal-secret|private-owner/);
    expect(readFileSync(sourcePath)).toEqual(sourceBefore);
    expect(readFileSync(targetPath)).toEqual(targetBefore);
  });
});
