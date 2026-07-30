import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readCanonicalRunStatus } from '../../src/core/run-status-authority.js';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-run-authority-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function json(root: string, relative: string, value: unknown): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value), 'utf-8');
}

describe('canonical run status authority', () => {
  it('projects one PAUSED truth over stale ACTIVE/COMPLETE surfaces and exposes recovery', () => {
    const root = fixture();
    const sprintId = 'sprint-901';
    json(root, '.deckent/sprint-active.json', { sprintId });
    json(root, '.deckent/sprint-state.json', { sprintId, phase: 'EXECUTE', status: 'ACTIVE' });
    json(root, '.deckent/pause-state.json', {
      sprintId,
      phase: 'EVALUATE',
      status: 'PAUSED',
      reason: 'provider auth',
      recoveryCommand: `deckent recover ${sprintId} --resume`,
    });
    json(root, '.dashboard', {
      sprint: { id: sprintId, phase: 'COMPLETE', status: 'COMPLETE' },
    });
    json(root, `.deckent/${sprintId}-checkpoint.json`, { sprintId });

    const status = readCanonicalRunStatus(root);

    expect(status).toMatchObject({
      lifecycle: 'PAUSED',
      active: false,
      resumable: true,
      sprintId,
      phase: 'EVALUATE',
      recoveryCommand: `deckent recover ${sprintId} --resume`,
    });
    expect(status.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: 'sprint-state', value: 'ACTIVE-while-canonical-PAUSED' }),
      expect.objectContaining({ surface: 'dashboard', value: 'COMPLETE-while-canonical-PAUSED' }),
      expect.objectContaining({ surface: 'coordinator-pid', value: 'absent-while-active-marker-present' }),
    ]));
  });

  it('reports ACTIVE only when the coordinator PID is alive', () => {
    const root = fixture();
    const sprintId = 'sprint-902';
    json(root, '.deckent/sprint-active.json', { sprintId });
    json(root, '.deckent/sprint-state.json', { sprintId, phase: 'EXECUTE', status: 'ACTIVE' });
    json(root, `.deckent/pids/${sprintId}.pid`, { pid: process.pid });

    expect(readCanonicalRunStatus(root)).toMatchObject({
      lifecycle: 'ACTIVE',
      active: true,
      coordinator: 'alive',
      sprintId,
    });
  });

  it('reports dead-coordinator evidence as resumable ORPHANED instead of ACTIVE', () => {
    const root = fixture();
    const sprintId = 'sprint-903';
    json(root, '.deckent/sprint-active.json', { sprintId });
    json(root, '.deckent/sprint-state.json', { sprintId, phase: 'EXECUTE', status: 'ACTIVE' });
    json(root, `.deckent/pids/${sprintId}.pid`, { pid: 2_147_483_647 });
    json(root, `.deckent/${sprintId}-checkpoint.json`, { sprintId });

    expect(readCanonicalRunStatus(root)).toMatchObject({
      lifecycle: 'ORPHANED',
      active: false,
      resumable: true,
      coordinator: 'dead',
      recoveryCommand: `deckent recover ${sprintId} --resume`,
    });
  });

  it('uses a fresh coordinator snapshot when the host PID is namespace-invisible', () => {
    const root = fixture();
    const sprintId = 'sprint-namespace';
    const nowMs = Date.parse('2026-07-30T12:00:00.000Z');
    const hostPid = 2_147_483_647;
    json(root, '.deckent/sprint-active.json', { sprintId });
    json(root, '.deckent/sprint-state.json', { sprintId, phase: 'EXECUTE', status: 'ACTIVE' });
    json(root, '.deckent/config.json', { heartbeat_timeout: 90 });
    json(root, `.deckent/pids/${sprintId}.pid`, { pid: hostPid });
    json(root, `.deckent/pids/${sprintId}.snapshot.json`, {
      sprintId,
      pid: hostPid,
      lastHeartbeat: '2026-07-30T11:59:30.000Z',
    });

    expect(readCanonicalRunStatus(root, { nowMs })).toMatchObject({
      lifecycle: 'ACTIVE',
      active: true,
      coordinator: 'alive',
      sprintId,
    });
  });

  it('expires stale namespace-fallback evidence to ORPHANED', () => {
    const root = fixture();
    const sprintId = 'sprint-stale-lease';
    const nowMs = Date.parse('2026-07-30T12:00:00.000Z');
    const hostPid = 2_147_483_647;
    json(root, '.deckent/sprint-active.json', { sprintId });
    json(root, '.deckent/sprint-state.json', { sprintId, phase: 'EXECUTE', status: 'ACTIVE' });
    json(root, '.deckent/config.json', { heartbeat_timeout: 90 });
    json(root, `.deckent/pids/${sprintId}.pid`, { pid: hostPid });
    json(root, `.deckent/pids/${sprintId}.snapshot.json`, {
      sprintId,
      pid: hostPid,
      lastHeartbeat: '2026-07-30T11:57:00.000Z',
    });
    json(root, `.deckent/${sprintId}-checkpoint.json`, { sprintId });

    expect(readCanonicalRunStatus(root, { nowMs })).toMatchObject({
      lifecycle: 'ORPHANED',
      active: false,
      coordinator: 'dead',
      sprintId,
    });
  });

  it('does not let a stale pause from another run hide a live current run', () => {
    const root = fixture();
    const sprintId = 'sprint-904';
    json(root, '.deckent/sprint-active.json', { sprintId });
    json(root, '.deckent/sprint-state.json', { sprintId, phase: 'EXECUTE', status: 'ACTIVE' });
    json(root, `.deckent/pids/${sprintId}.pid`, { pid: process.pid });
    json(root, '.deckent/pause-state.json', {
      sprintId: 'sprint-467',
      phase: 'FIX',
      status: 'PAUSED',
      reason: 'stale authority',
    });

    const status = readCanonicalRunStatus(root);

    expect(status).toMatchObject({
      lifecycle: 'ACTIVE',
      active: true,
      sprintId,
      coordinator: 'alive',
    });
    expect(status.conflicts).toContainEqual(
      expect.objectContaining({ surface: 'pause-state', sprintId: 'sprint-467' }),
    );
  });

  it('reports a dashboard-only ACTIVE projection as canonical IDLE conflict', () => {
    const root = fixture();
    json(root, '.dashboard', {
      sprint: { id: 'sprint-479', phase: 'EXECUTE', status: 'ACTIVE' },
    });

    const status = readCanonicalRunStatus(root);

    expect(status).toMatchObject({
      lifecycle: 'IDLE',
      active: false,
      sprintId: null,
    });
    expect(status.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'dashboard',
        sprintId: 'sprint-479',
        value: 'ACTIVE-while-canonical-IDLE',
      }),
    ]));
  });

  it('surfaces a sprint.lock identity that differs from canonical execution', () => {
    const root = fixture();
    const sprintId = 'sprint-479';
    json(root, '.deckent/sprint-state.json', {
      sprintId,
      phase: 'EXECUTE',
      status: 'ACTIVE',
    });
    json(root, `.deckent/pids/${sprintId}.pid`, { pid: process.pid });
    json(root, '.deckent/sprint.lock', {
      pid: process.pid,
      sprintId: 'sprint-1785432115882',
    });

    const status = readCanonicalRunStatus(root);

    expect(status.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'sprint-lock',
        sprintId: 'sprint-1785432115882',
        value: 'identity-mismatch:sprint-1785432115882',
      }),
    ]));
  });
});
