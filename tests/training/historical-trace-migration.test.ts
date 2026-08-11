import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HistoricalTraceMigrationConflictError,
  HistoricalTraceMigrationError,
  migrateHistoricalTraces,
} from '../../src/training/historical-trace-migration.js';

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');

async function fixture(lines: string[], name = 'sprint-worker.jsonl'): Promise<{ root: string; input: string }> {
  const root = await mkdtemp(join(tmpdir(), 'historical-migration-'));
  await mkdir(join(root, 'input'));
  const input = join(root, 'input', name);
  await writeFile(input, lines.join('\n') + '\n');
  return { root, input };
}

function sprintRecord(messages: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 2,
    messages,
    meta: { source: 'sprint-worker', schemaVersion: 2, sprintId: 'sprint-1', taskId: '1-001', ...extra },
    consentAuthority: 'granted',
  });
}

describe('migrateHistoricalTraces', () => {
  it('publishes a deterministic redacted projection, quarantines malformed input, and verifies idempotent replay', async () => {
    const duplicate = sprintRecord([{ role: 'user', content: 'secret sk-' + 'x'.repeat(24) }]);
    const { root, input } = await fixture([duplicate, '{ broken', duplicate]);
    const before = await readFile(input);
    const options = {
      projectRoot: root,
      inputPaths: ['input'],
      outputPath: '.deckent/training/migrations/trace-v1',
      dryRun: false,
      policy: { allowTraining: true, requireConsentAuthority: true, trainingWeight: 1 },
    } as const;
    const first = await migrateHistoricalTraces(options);
    expect(first.status).toBe('published');
    expect(first.inventory).toMatchObject({
      physicalLines: 3, nonEmptyLines: 3, parsedRecords: 2, projectedRecords: 2,
      malformedRecords: 1, zeroWeightDuplicateRecords: 1,
    });
    expect(first.manifest).toMatchObject({
      migrationId: expect.stringMatching(/^[a-f0-9]{64}$/),
      prePostSourceReconciled: true,
      publicationProtocol: 'manifest-last-no-clobber-v1',
    });
    const output = join(root, '.deckent', 'training', 'migrations', 'trace-v1');
    const projectionRaw = await readFile(join(output, 'projection.jsonl'), 'utf8');
    expect(projectionRaw).toContain('[REDACTED]');
    expect(projectionRaw).not.toContain('sk-' + 'x'.repeat(24));
    const projected = projectionRaw.trim().split('\n').map(line => JSON.parse(line));
    expect(projected[0].disposition).toBe('train-ready');
    expect(projected[1]).toMatchObject({ trainingWeight: 0, disposition: 'manual-review-required' });
    expect(projected[1].duplicateOf).toEqual([projected[0].source.recordId]);
    expect(await readFile(input)).toEqual(before);
    await expect(migrateHistoricalTraces(options)).resolves.toMatchObject({ status: 'noop' });
  });

  it('makes dry-run side-effect free while producing the exact apply digests', async () => {
    const { root } = await fixture([sprintRecord([{ role: 'user', content: 'hello world' }])]);
    const common = { projectRoot: root, inputPaths: ['input'], outputPath: 'nested/migration' } as const;
    const dry = await migrateHistoricalTraces({ ...common, dryRun: true });
    expect(dry.status).toBe('dry-run');
    await expect(access(join(root, 'nested'))).rejects.toMatchObject({ code: 'ENOENT' });
    const applied = await migrateHistoricalTraces({ ...common, dryRun: false });
    expect(applied.status).toBe('published');
    expect(applied.manifest.projectionDigest).toBe(dry.manifest.projectionDigest);
    expect(applied.manifest.malformedDigest).toBe(dry.manifest.malformedDigest);
    expect(applied.manifest.migrationId).toBe(dry.manifest.migrationId);
  });

  it('handles files larger than the old 16 MiB ceiling with bounded record processing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'historical-migration-large-'));
    await mkdir(join(root, 'input'));
    const line = sprintRecord([{ role: 'user', content: 'x'.repeat(1024) }]);
    const repetitions = Math.ceil((17 * 1024 * 1024) / (Buffer.byteLength(line) + 1));
    const body = (line + '\n').repeat(repetitions);
    expect(Buffer.byteLength(body)).toBeGreaterThan(16 * 1024 * 1024);
    await writeFile(join(root, 'input', 'sprint-worker.jsonl'), body);
    const result = await migrateHistoricalTraces({ projectRoot: root, inputPaths: ['input'], outputPath: 'migration', dryRun: true });
    expect(result.inventory.parsedRecords).toBe(repetitions);
    expect(result.inventory.projectedRecords).toBe(repetitions);
    expect(result.inventory.zeroWeightDuplicateRecords).toBe(repetitions - 1);
  }, 30_000);

  it('detects cumulative prefix relations in linear trie order with stable first-writer authority', async () => {
    const short = sprintRecord([{ role: 'user', content: 'hello' }]);
    const long = sprintRecord([{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'world' }]);
    const { root } = await fixture([short, long]);
    await migrateHistoricalTraces({ projectRoot: root, inputPaths: ['input'], outputPath: 'migration', dryRun: false });
    const records = (await readFile(join(root, 'migration', 'projection.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    expect(records[1].duplicateOf).toEqual([records[0].source.recordId]);
    expect(records[1].cumulativeReferences).toEqual([records[0].source.recordId]);
    expect(records[1].trainingWeight).toBe(0);
  });

  it('records line-limit failures with exact evidence and continues later records', async () => {
    const oversized = sprintRecord([{ role: 'user', content: 'x'.repeat(2048) }]);
    const valid = sprintRecord([{ role: 'user', content: 'ok after limit' }]);
    const { root } = await fixture([oversized, valid]);
    const result = await migrateHistoricalTraces({
      projectRoot: root, inputPaths: ['input'], outputPath: 'migration', dryRun: false,
      limits: { maxLineBytes: 1024 },
    });
    expect(result.inventory).toMatchObject({ malformedRecords: 1, parsedRecords: 1, projectedRecords: 1 });
    const malformed = JSON.parse((await readFile(join(root, 'migration', 'malformed.jsonl'), 'utf8')).trim());
    expect(malformed).toMatchObject({ reason: 'line-byte-limit', source: { line: 1, byteLength: Buffer.byteLength(oversized) } });
    expect(malformed.source.lineDigest).toBe(sha256(oversized));
  });

  it('projects causally incomplete legacy records as quarantined evidence instead of dropping them as malformed', async () => {
    const legacy = sprintRecord([
      { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'Read', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '', content: 'observed result without an id' },
    ]);
    const { root } = await fixture([legacy]);
    const result = await migrateHistoricalTraces({
      projectRoot: root,
      inputPaths: ['input'],
      outputPath: 'migration',
      dryRun: false,
      policy: { allowTraining: true, trainingWeight: 1 },
    });
    expect(result.inventory).toMatchObject({ parsedRecords: 1, projectedRecords: 1, malformedRecords: 0 });
    const projected = JSON.parse((await readFile(join(root, 'migration', 'projection.jsonl'), 'utf8')).trim());
    expect(projected).toMatchObject({
      disposition: 'quarantined',
      trainingWeight: 0,
      reasonCodes: expect.arrayContaining(['missing-causal-tool-reference']),
    });
  });

  it('refuses path escape, source/output overlap, nested symlinks, and different existing migrations', async () => {
    const { root } = await fixture([sprintRecord([{ role: 'user', content: 'hello' }])]);
    await expect(migrateHistoricalTraces({ projectRoot: root, inputPaths: ['../escape'], outputPath: 'x' }))
      .rejects.toMatchObject<Partial<HistoricalTraceMigrationError>>({ code: 'PATH_AUTHORITY_INVALID' });
    await expect(migrateHistoricalTraces({ projectRoot: root, inputPaths: ['input'], outputPath: 'input/output' }))
      .rejects.toMatchObject<Partial<HistoricalTraceMigrationError>>({ code: 'INPUT_OUTPUT_OVERLAP' });

    await symlink(join(root, 'input', 'sprint-worker.jsonl'), join(root, 'input', 'alias.jsonl'));
    await expect(migrateHistoricalTraces({ projectRoot: root, inputPaths: ['input'], outputPath: 'migration' }))
      .rejects.toMatchObject<Partial<HistoricalTraceMigrationError>>({ code: 'SYMLINK_REFUSED' });

    const clean = await fixture([sprintRecord([{ role: 'user', content: 'hello' }])]);
    await migrateHistoricalTraces({ projectRoot: clean.root, inputPaths: ['input'], outputPath: 'migration', dryRun: false });
    await expect(migrateHistoricalTraces({ projectRoot: clean.root, inputPaths: ['input'], outputPath: 'migration', dryRun: false, policy: { exclude: true } }))
      .rejects.toBeInstanceOf(HistoricalTraceMigrationConflictError);
  });
});
