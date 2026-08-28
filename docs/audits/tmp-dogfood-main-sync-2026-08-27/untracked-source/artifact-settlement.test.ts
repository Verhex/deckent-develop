import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAutonomousArtifactSettlement,
  planAutonomousArtifactSettlement,
} from '../../../src/orchestra/autonomous/artifact-settlement.js';

describe('Autonomous artifact settlement', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

  it('archives one exact terminal attempt, preserves foreign Runs, verifies hashes, and deduplicates', () => {
    const root = mkdtempSync(join(tmpdir(), 'artifact-settlement-'));
    roots.push(root);
    const tasks = join(root, '.tasks');
    const autonomous = join(root, '.deckent', 'autonomous');
    mkdirSync(tasks, { recursive: true });
    mkdirSync(autonomous, { recursive: true });
    const foreignA = Buffer.from('foreign-run-a');
    const foreignB = Buffer.from('foreign-run-b');
    writeFileSync(join(tasks, 'task-run-100-0.result'), foreignA);
    writeFileSync(join(tasks, 'task-run-101-0.result'), foreignB);
    writeFileSync(join(tasks, 'task-owned.json'), JSON.stringify({ id: 'owned', status: 'done' }));
    writeFileSync(join(tasks, 'task-owned.result'), 'terminal-result');
    writeFileSync(join(tasks, 'task-owned.hb'), 'terminal-heartbeat');
    writeFileSync(join(autonomous, 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [{
        id: 'entry-one', title: 'owned', kind: 'task', spec: {}, policy: 'auto',
        trigger: { type: 'one-off' }, status: 'done', lastRun: '2026-08-27T00:00:00Z',
        lastResult: { ok: true, reason: 'done', taskLineage: {
          taskId: 'owned', settlementRef: { schemaVersion: 1, taskId: 'owned', backend: 'docker',
            projectRootSha256: 'a'.repeat(64), attemptId: '00000000-0000-4000-8000-000000000001' },
        } },
      }],
    }));

    const plan = planAutonomousArtifactSettlement({ projectRoot: root, entryId: 'entry-one' });
    expect(plan.disposition).toBe('READY');
    expect(plan.files.map((file) => file.name)).toEqual([
      'task-owned.hb', 'task-owned.json', 'task-owned.result',
    ]);
    expect(readFileSync(join(tasks, 'task-owned.result'), 'utf8')).toBe('terminal-result');
    expect(plan.preserved.map((item) => item.name)).toEqual([
      'task-run-100-0.result', 'task-run-101-0.result',
    ]);

    const receipt = applyAutonomousArtifactSettlement(plan, plan.planDigest);
    expect(receipt.disposition).toBe('ARCHIVED');
    expect(existsSync(join(tasks, 'task-owned.result'))).toBe(false);
    expect(readFileSync(join(tasks, 'task-run-100-0.result'))).toEqual(foreignA);
    expect(readFileSync(join(tasks, 'task-run-101-0.result'))).toEqual(foreignB);
    const archive = join(root, receipt.archivePath!);
    for (const file of receipt.archived) {
      const bytes = readFileSync(join(archive, file.name));
      expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(file.sha256);
      expect(bytes.byteLength).toBe(file.bytes);
    }
    expect(JSON.parse(readFileSync(join(archive, 'receipt.json'), 'utf8')).planDigest).toBe(plan.planDigest);
    expect(applyAutonomousArtifactSettlement(plan, plan.planDigest).disposition).toBe('DEDUPLICATED');
  });

  it('requires the exact digest and never mutates on changed authority', () => {
    const root = mkdtempSync(join(tmpdir(), 'artifact-settlement-cas-'));
    roots.push(root);
    const tasks = join(root, '.tasks');
    const autonomous = join(root, '.deckent', 'autonomous');
    mkdirSync(tasks, { recursive: true }); mkdirSync(autonomous, { recursive: true });
    writeFileSync(join(tasks, 'task-t.json'), '{}');
    writeFileSync(join(autonomous, 'backlog.json'), JSON.stringify({ _version: '1.0', entries: [{
      id: 'e', title: 't', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' },
      status: 'done', lastRun: null, lastResult: { ok: true, reason: 'x', taskLineage: { taskId: 't',
        settlementRef: { schemaVersion: 1, taskId: 't', backend: 'docker', projectRootSha256: 'b'.repeat(64),
          attemptId: '00000000-0000-4000-8000-000000000002' } } },
    }] }));
    const plan = planAutonomousArtifactSettlement({ projectRoot: root, entryId: 'e' });
    expect(applyAutonomousArtifactSettlement(plan, 'sha256:wrong').disposition).toBe('HOLD');
    expect(existsSync(join(tasks, 'task-t.json'))).toBe(true);
  });

  it('distinguishes a terminal entry with incomplete lineage from an unknown selector', () => {
    const root = mkdtempSync(join(tmpdir(), 'artifact-settlement-lineage-'));
    roots.push(root);
    const autonomous = join(root, '.deckent', 'autonomous');
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(autonomous, { recursive: true });
    writeFileSync(join(autonomous, 'backlog.json'), JSON.stringify({ _version: '1.0', entries: [{
      id: 'failed-without-lineage', title: 'failed', kind: 'task', spec: {}, policy: 'auto',
      trigger: { type: 'one-off' }, status: 'failed', lastRun: null,
      lastResult: { ok: false, reason: 'admission failed' },
    }] }));

    const incomplete = planAutonomousArtifactSettlement({
      projectRoot: root,
      entryId: 'failed-without-lineage',
    });
    const unknown = planAutonomousArtifactSettlement({ projectRoot: root, entryId: 'unknown' });

    expect(incomplete).toMatchObject({
      disposition: 'HOLD',
      entryId: 'failed-without-lineage',
      holdReasons: ['LINEAGE_EVIDENCE_INCOMPLETE'],
    });
    expect(unknown).toMatchObject({
      disposition: 'HOLD',
      entryId: null,
      holdReasons: ['ENTRY_NOT_FOUND'],
    });
  });

  it('distinguishes non-terminal selection, no eligible lineage, and multiple eligible lineages', () => {
    const root = mkdtempSync(join(tmpdir(), 'artifact-settlement-selector-'));
    roots.push(root);
    const autonomous = join(root, '.deckent', 'autonomous');
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(autonomous, { recursive: true });
    const entry = (id: string, status: string, withLineage: boolean) => ({
      id, title: id, kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' },
      status, lastRun: null, lastResult: {
        ok: status === 'done', reason: status,
        ...(withLineage ? { taskLineage: {
          taskId: id,
          settlementRef: {
            schemaVersion: 1, taskId: id, backend: 'docker',
            projectRootSha256: 'c'.repeat(64),
            attemptId: `00000000-0000-4000-8000-${id === 'done-a' ? '000000000003' : '000000000004'}`,
          },
        } } : {}),
      },
    });
    const backlogPath = join(autonomous, 'backlog.json');
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [
      entry('parked', 'parked', false),
      entry('failed-no-lineage', 'failed', false),
    ] }));

    expect(planAutonomousArtifactSettlement({ projectRoot: root, entryId: 'parked' }))
      .toMatchObject({ entryId: 'parked', holdReasons: ['ENTRY_NOT_TERMINAL'] });
    expect(planAutonomousArtifactSettlement({ projectRoot: root }))
      .toMatchObject({ holdReasons: ['NO_ELIGIBLE_TERMINAL_LINEAGE'] });

    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [
      entry('done-a', 'done', true),
      entry('done-b', 'done', true),
    ] }));
    expect(planAutonomousArtifactSettlement({ projectRoot: root }))
      .toMatchObject({ holdReasons: ['MULTIPLE_ELIGIBLE_LINEAGES'] });
  });
});
