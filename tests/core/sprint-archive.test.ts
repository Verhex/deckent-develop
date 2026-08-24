import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '../../src/core/memory-store.js';
import Database from 'better-sqlite3';
import {
  archiveTaskArtifacts,
  reconcileSprintArchive,
  publishSprintArchiveArtifact,
  resolveSprintArchiveDir,
  verifySprintArchive,
  type SprintArchiveManifest,
} from '../../src/core/sprint-archive.js';

const SPRINT_ID = 'sprint-621';
let root: string;

function write(relativePath: string, content: string): string {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  return path;
}

function readManifest(): SprintArchiveManifest {
  return JSON.parse(readFileSync(
    join(resolveSprintArchiveDir(root, SPRINT_ID), 'manifest.json'),
    'utf-8',
  )) as SprintArchiveManifest;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-sprint-archive-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('canonical sprint archive reconciliation', () => {
  it('archives only receipt-referenced full-digest core bytes and replay-verifies them', () => {
    const core = 'canonical worker system prompt';
    const digest = createHash('sha256').update(core).digest('hex');
    write(`.tasks/.worker-core-${digest}.md`, core);
    write('.tasks/.worker-core-deadbeefdead.md', 'historical short hash');
    write('.tasks/task-621-009.attempt-attempt-2.codex.prompt-delivery.json', JSON.stringify({
      version: 2,
      taskId: '621-009',
      runtimeDelivery: {
        coreArtifactPath: '.tasks/.worker-core-deadbeefdead.md',
        coreSha256: 'f'.repeat(64),
        coreBytes: 21,
      },
    }));
    write('.tasks/task-621-008.attempt-attempt-1.codex.prompt-delivery.json', JSON.stringify({
      version: 2,
      taskId: '621-008',
      source: 'worker-prompt',
      runtimeDelivery: {
        attemptId: 'attempt-1',
        provider: 'codex',
        coreArtifactPath: `.tasks/.worker-core-${digest}.md`,
        coreSha256: digest,
        coreBytes: Buffer.byteLength(core),
        roleProfile: 'worker:implementer',
        injectionChannel: 'codex-model-instructions-file',
        contextSuppressionFlags: ['project_doc_max_bytes=0'],
        providerArgvSha256: 'a'.repeat(64),
      },
    }));
    write('.deckent/recently-works/sprint-621-terminal-receipt.json', JSON.stringify({
      terminalOutcome: 'COMPLETE',
    }));

    const report = reconcileSprintArchive(root, SPRINT_ID, { apply: true, indexMemory: false });
    const archivedCore = join(report.archiveDir, 'tasks', 'worker-cores', `.worker-core-${digest}.md`);
    expect(readFileSync(archivedCore, 'utf8')).toBe(core);
    expect(report.manifest.artifacts.some(
      artifact => artifact.path.includes('deadbeefdead'),
    )).toBe(false);
    expect(report.manifest.artifacts.some(
      artifact => artifact.path.includes('task-621-009'),
    )).toBe(false);
    expect(verifySprintArchive(root, SPRINT_ID).ok).toBe(true);

    const archivedReceipt = join(
      report.archiveDir,
      'tasks',
      'task-621-008.attempt-attempt-1.codex.prompt-delivery.json',
    );
    expect(JSON.parse(readFileSync(archivedReceipt, 'utf8'))).toMatchObject({
      taskId: '621-008',
      runtimeDelivery: {
        attemptId: 'attempt-1',
        provider: 'codex',
        injectionChannel: 'codex-model-instructions-file',
        providerArgvSha256: 'a'.repeat(64),
      },
    });

    writeFileSync(archivedCore, 'tampered', 'utf8');
    expect(verifySprintArchive(root, SPRINT_ID)).toMatchObject({
      ok: false,
      mismatched: expect.arrayContaining([
        `tasks/worker-cores/.worker-core-${digest}.md`,
      ]),
    });
  });

  it('rejects receipts whose exact invocation provenance contradicts their filename', () => {
    const core = 'untrusted worker core';
    const digest = createHash('sha256').update(core).digest('hex');
    write(`.tasks/.worker-core-${digest}.md`, core);
    write('.tasks/task-621-008.attempt-attempt-1.codex.prompt-delivery.json', JSON.stringify({
      version: 2,
      source: 'worker-prompt',
      taskId: '621-008',
      runtimeDelivery: {
        attemptId: 'another-attempt',
        provider: 'codex',
        coreArtifactPath: `.tasks/.worker-core-${digest}.md`,
        coreSha256: digest,
        coreBytes: Buffer.byteLength(core),
        roleProfile: 'worker:implementer',
        injectionChannel: 'codex-model-instructions-file',
        contextSuppressionFlags: [],
        providerArgvSha256: 'b'.repeat(64),
      },
    }));
    write('.deckent/recently-works/sprint-621-terminal-receipt.json', JSON.stringify({
      terminalOutcome: 'COMPLETE',
    }));

    const report = reconcileSprintArchive(root, SPRINT_ID, { apply: true, indexMemory: false });

    expect(report.manifest.artifacts.some(
      artifact => artifact.path.includes('prompt-delivery')
        || artifact.path.includes('worker-cores'),
    )).toBe(false);
    expect(existsSync(join(root, `.tasks/.worker-core-${digest}.md`))).toBe(true);
  });

  it('collects split evidence, retires only exact-sprint legacy files, indexes Brain, and is idempotent', () => {
    const legacyBrain = '.brain/archive/sprints/sprint-621-tasks';
    write(`${legacyBrain}/task-621-001.json`, JSON.stringify({ id: '621-001', sprintId: SPRINT_ID }));
    write(`${legacyBrain}/task-621-001.result`, JSON.stringify({ taskId: '621-001' }));
    write(`${legacyBrain}/task-620-foreign.result`, 'foreign');
    write('.tasks/archive/sprint-621/task-621-002.result', JSON.stringify({ taskId: '621-002' }));
    write('.deckent/recently-works/sprint-621-terminal-receipt.json', JSON.stringify({
      terminalOutcome: 'COMPLETE',
    }));
    write('.deckent/runtime/evaluations/sprint-621/621-001.json', '{"decision":"DONE"}');
    write('.brain/archive/directives/DIRECTIVES-sprint-621.md', '# frozen directives');
    write('.brain/sprints/sprint-621.md', '# sprint log');
    write('docs/audits/sprint-621/load-test-report.md', '# load evidence');

    const dbPath = join(root, '.brain', 'memory.db');
    mkdirSync(join(root, '.brain'), { recursive: true });
    const memory = new MemoryStore(dbPath);
    memory.insert({
      id: 'retro-sprint-621',
      type: 'retrospective',
      title: 'Sprint 621 retrospective',
      content: 'Recovered archive evidence',
      source: 'brain',
      status: 'active',
      sprint_id: SPRINT_ID,
      sprint_num: 621,
      tags: ['sprint-621'],
      decay_exempt: true,
    });
    memory.close();

    const first = reconcileSprintArchive(root, SPRINT_ID, {
      apply: true,
      retireLegacySources: true,
      indexMemory: true,
    });
    expect(first.failures).toEqual([]);
    expect(first.retired).toBe(3);
    expect(first.manifest.terminalOutcome).toBe('COMPLETE');
    expect(first.manifest.familyCounts.tasks).toBe(3);
    expect(first.manifest.familyCounts.evaluations).toBe(1);
    expect(first.manifest.familyCounts.docs).toBe(2);
    expect(first.manifest.familyCounts.audits).toBe(1);
    expect(first.manifest.memoryReferences.map(reference => reference.id))
      .toContain('retro-sprint-621');

    const archiveDir = resolveSprintArchiveDir(root, SPRINT_ID);
    expect(existsSync(join(archiveDir, 'tasks', 'task-621-001.json'))).toBe(true);
    expect(existsSync(join(archiveDir, 'tasks', 'task-621-002.result'))).toBe(true);
    expect(existsSync(join(archiveDir, 'evaluations', '621-001.json'))).toBe(true);
    expect(existsSync(join(archiveDir, 'audits', 'project-docs', 'load-test-report.md'))).toBe(true);
    expect(existsSync(join(root, legacyBrain, 'task-620-foreign.result'))).toBe(true);
    expect(existsSync(join(root, legacyBrain, 'task-621-001.json'))).toBe(false);
    expect(verifySprintArchive(root, SPRINT_ID).ok).toBe(true);

    const indexed = new MemoryStore(dbPath);
    const archiveIndex = indexed.getById('archive-sprint-621');
    indexed.close();
    expect(archiveIndex?.type).toBe('sprint-archive');
    expect(archiveIndex?.content).toContain('.deckent/archive/sprints/sprint-621');

    const firstDigest = readManifest().contentDigest;
    const timestampDb = new Database(dbPath);
    timestampDb.prepare(
      "UPDATE entries SET updated_at = '2000-01-01 00:00:00' WHERE id = ?",
    ).run('archive-sprint-621');
    timestampDb.close();
    const second = reconcileSprintArchive(root, SPRINT_ID, {
      apply: true,
      retireLegacySources: true,
      indexMemory: true,
    });
    expect(second.failures).toEqual([]);
    expect(second.retired).toBe(0);
    expect(second.manifest.contentDigest).toBe(firstDigest);
    expect(verifySprintArchive(root, SPRINT_ID).ok).toBe(true);
    const idempotentIndex = new MemoryStore(dbPath);
    expect(idempotentIndex.getById('archive-sprint-621')?.updated_at)
      .toBe('2000-01-01 00:00:00');
    idempotentIndex.close();
  });

  it('preserves conflicting bytes as hash-addressed variants and manifests the conflict', () => {
    write('.deckent/archive/sprints/sprint-621/tasks/task-621-001.result', 'canonical');
    write('.brain/archive/sprints/sprint-621-tasks/task-621-001.result', 'legacy-different');

    const report = reconcileSprintArchive(root, SPRINT_ID, {
      apply: true,
      retireLegacySources: true,
      indexMemory: false,
    });

    expect(report.failures).toEqual([]);
    expect(report.conflicts).toBe(1);
    const conflictDir = join(report.archiveDir, 'tasks', 'conflicts');
    const variants = readdirSync(conflictDir);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatch(/^task-621-001\.result\.[0-9a-f]{16}$/u);
    expect(readFileSync(join(conflictDir, variants[0]!), 'utf-8')).toBe('legacy-different');
    expect(report.manifest.conflicts).toEqual([{
      path: 'tasks/task-621-001.result',
      variants: [
        'tasks/conflicts/' + variants[0],
        'tasks/task-621-001.result',
      ].sort(),
    }]);
    expect(verifySprintArchive(root, SPRINT_ID).ok).toBe(true);
  });

  it('predicts intra-batch conflicts in dry-run exactly as apply publishes them', () => {
    write(
      '.brain/archive/sprints/sprint-621-tasks/task-621-001.result',
      'first-legacy-variant',
    );
    write('.tasks/archive/sprint-621/task-621-001.result', 'second-legacy-variant');

    const inspection = reconcileSprintArchive(root, SPRINT_ID);

    expect(inspection.failures).toEqual([]);
    expect(inspection.conflicts).toBe(1);
    expect(inspection.manifest.artifactCount).toBe(2);
    expect(inspection.manifest.conflicts).toEqual([expect.objectContaining({
      path: 'tasks/task-621-001.result',
    })]);

    const applied = reconcileSprintArchive(root, SPRINT_ID, {
      apply: true,
      indexMemory: false,
    });
    expect(applied.failures).toEqual([]);
    expect(applied.conflicts).toBe(1);
    expect(applied.manifest.contentDigest).toBe(inspection.manifest.contentDigest);
    expect(verifySprintArchive(root, SPRINT_ID).ok).toBe(true);
  });

  it('detects post-publication byte tampering', () => {
    const receipt = write(
      '.deckent/recently-works/sprint-621-terminal-receipt.json',
      JSON.stringify({ terminalOutcome: 'COMPLETE' }),
    );
    reconcileSprintArchive(root, SPRINT_ID, { apply: true, indexMemory: false });
    expect(verifySprintArchive(root, SPRINT_ID).ok).toBe(true);

    const archivedReceipt = join(
      resolveSprintArchiveDir(root, SPRINT_ID),
      'sprint-621-terminal-receipt.json',
    );
    writeFileSync(archivedReceipt, `${readFileSync(receipt, 'utf-8')}tampered`, 'utf-8');
    const verification = verifySprintArchive(root, SPRINT_ID);
    expect(verification.ok).toBe(false);
    expect(verification.mismatched).toContain('sprint-621-terminal-receipt.json');
  });

  it('keeps inspect/dry-run read-only while returning deterministic hashes', () => {
    const source = write(
      '.brain/archive/sprints/sprint-621-tasks/task-621-001.result',
      'legacy',
    );
    const report = reconcileSprintArchive(root, SPRINT_ID);
    expect(report.applied).toBe(false);
    expect(report.manifest.artifacts).toHaveLength(1);
    expect(report.manifest.artifacts[0]?.sha256).toBe(
      createHash('sha256').update('legacy').digest('hex'),
    );
    expect(existsSync(source)).toBe(true);
    expect(existsSync(resolveSprintArchiveDir(root, SPRINT_ID))).toBe(false);
  });

  it('includes already-canonical evidence in inspect/dry-run truth', () => {
    write('.deckent/archive/sprints/sprint-621/tasks/task-621-001.result', 'canonical');

    const report = reconcileSprintArchive(root, SPRINT_ID);

    expect(report.applied).toBe(false);
    expect(report.manifest.artifacts).toEqual([expect.objectContaining({
      path: 'tasks/task-621-001.result',
      family: 'tasks',
      sha256: createHash('sha256').update('canonical').digest('hex'),
    })]);
  });

  it('publishes direct writers through the same conflict-preserving authority', () => {
    const first = write('sources/first.md', 'first');
    const second = write('sources/second.md', 'second');

    const initial = publishSprintArchiveArtifact(
      root,
      SPRINT_ID,
      first,
      'docs/DIRECTIVES.md',
      { retireSource: true },
    );
    const conflict = publishSprintArchiveArtifact(
      root,
      SPRINT_ID,
      second,
      'docs/DIRECTIVES.md',
      { retireSource: true },
    );

    expect(initial.state).toBe('published');
    expect(conflict.state).toBe('conflict');
    expect(existsSync(first)).toBe(false);
    expect(existsSync(second)).toBe(false);
    expect(readFileSync(join(resolveSprintArchiveDir(root, SPRINT_ID), initial.path), 'utf-8'))
      .toBe('first');
    expect(readFileSync(join(resolveSprintArchiveDir(root, SPRINT_ID), conflict.path), 'utf-8'))
      .toBe('second');
  });

  it('archives only settled handoffs with two parsed current-sprint endpoints', () => {
    const settledContent = JSON.stringify({
      id: '621-001-to-621-002', fromTaskId: '621-001', toTaskId: '621-002',
      artifacts: ['src/a.ts'], status: 'ready', createdAt: '2026-08-23T00:00:00.000Z',
    });
    const settled = write('.tasks/handoffs/621-001-to-621-002.json', settledContent);
    const pending = write('.tasks/handoffs/621-002-to-621-003.json', JSON.stringify({
      id: '621-002-to-621-003', fromTaskId: '621-002', toTaskId: '621-003',
      artifacts: ['src/b.ts'], status: 'pending', createdAt: '2026-08-23T00:00:00.000Z',
    }));
    const foreign = write('.tasks/handoffs/621-003-to-620-001.json', JSON.stringify({
      id: '621-003-to-620-001', fromTaskId: '621-003', toTaskId: '620-001',
      artifacts: ['src/c.ts'], status: 'ready', createdAt: '2026-08-23T00:00:00.000Z',
    }));
    const malformed = write('.tasks/handoffs/looks-current.json', '{not json');

    const report = reconcileSprintArchive(root, SPRINT_ID, {
      apply: true, retireLegacySources: true, indexMemory: false,
    });
    const archived = join(resolveSprintArchiveDir(root, SPRINT_ID), 'tasks', 'handoffs',
      '621-001-to-621-002.json');

    expect(report.failures).toEqual([]);
    expect(readFileSync(archived, 'utf8')).toBe(settledContent);
    expect(existsSync(settled)).toBe(false);
    expect(existsSync(pending)).toBe(true);
    expect(existsSync(foreign)).toBe(true);
    expect(existsSync(malformed)).toBe(true);
    expect(verifySprintArchive(root, SPRINT_ID).ok).toBe(true);
  });

  it('never adopts sprint-610 residue found inside sprint-611 legacy staging', () => {
    const owned = write('.tasks/archive/sprint-611/task-611-001.result', 'owned');
    const foreign = write('.tasks/archive/sprint-611/task-610-999.result', 'foreign');

    const result = archiveTaskArtifacts(root, 'sprint-611', {
      archive: [],
      preserve: [],
      sweepResidue: false,
    });

    expect(result.failures).toEqual([]);
    expect(existsSync(owned)).toBe(false);
    expect(existsSync(foreign)).toBe(true);
    expect(readFileSync(
      join(resolveSprintArchiveDir(root, 'sprint-611'), 'tasks', 'task-611-001.result'),
      'utf-8',
    )).toBe('owned');
    expect(existsSync(
      join(resolveSprintArchiveDir(root, 'sprint-611'), 'tasks', 'task-610-999.result'),
    )).toBe(false);
  });
});
