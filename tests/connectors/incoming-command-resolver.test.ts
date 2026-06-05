/**
 * BOT-002 — command resolver tests (§4G).
 *
 * The resolver owns gate routing: given an id + action it finds the OWNING gate
 * (autonomous pending.json or nervous nervous-pending.json) and resolves it
 * DURABLY — autonomous via decisions.json (applied on next re-eval), nervous via
 * the IPC queue (consumed by the executor poller now or on next start). Route by
 * ownership, never blind-try both; idempotent; not-found when neither owns it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCommandResolver } from '../../src/connectors/incoming-command-resolver.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bot002-resolve-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function seedAutonomousPending(triggerId: string): void {
  const dir = join(root, '.deckent', 'autonomous');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'pending.json'),
    JSON.stringify([{ triggerId, action: 'do-x', requestedBy: 'nervous', enqueuedAt: '2026-06-05T00:00:00.000Z' }]) + '\n',
  );
}
function readDecisions(): Record<string, { outcome: string }> {
  const p = join(root, '.deckent', 'autonomous', 'decisions.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : {};
}
function seedNervousPending(id: string): void {
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'nervous-pending.json'), JSON.stringify([{ id, title: 't', summary: 's' }]) + '\n');
}
function ipcPendingFiles(): string[] {
  const dir = join(root, '.deckent', 'nervous-ipc', 'pending');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
}

describe('makeCommandResolver — autonomous ownership (durable decisions.json)', () => {
  it('approve an owned trigger → resolved + decisions.json records approved', async () => {
    seedAutonomousPending('trig-1');
    const resolve = makeCommandResolver(root);
    expect(await resolve('trig-1', 'approve')).toBe('resolved');
    expect(readDecisions()['trig-1']?.outcome).toBe('approved');
  });

  it('reject an owned trigger → resolved + decisions.json records rejected', async () => {
    seedAutonomousPending('trig-2');
    const resolve = makeCommandResolver(root);
    expect(await resolve('trig-2', 'reject')).toBe('resolved');
    expect(readDecisions()['trig-2']?.outcome).toBe('rejected');
  });

  it('is idempotent — resolving twice stays resolved (platform re-sends)', async () => {
    seedAutonomousPending('trig-3');
    const resolve = makeCommandResolver(root);
    expect(await resolve('trig-3', 'approve')).toBe('resolved');
    expect(await resolve('trig-3', 'approve')).toBe('resolved');
    expect(readDecisions()['trig-3']?.outcome).toBe('approved');
  });
});

describe('makeCommandResolver — nervous ownership (durable IPC)', () => {
  it('real disk: nervous-pending id → resolved + an IPC pending file is written', async () => {
    seedNervousPending('n-1');
    const resolve = makeCommandResolver(root);
    expect(await resolve('n-1', 'approve')).toBe('resolved');
    expect(ipcPendingFiles().length).toBe(1);
  });

  it('injected: routes to writeNervousApproval with the full id + action', async () => {
    const writeNervousApproval = vi.fn(async () => {});
    const resolve = makeCommandResolver(root, {
      readNervousPending: () => [{ id: 'n-full-42' }],
      writeNervousApproval,
    });
    expect(await resolve('n-full-42', 'reject')).toBe('resolved');
    expect(writeNervousApproval).toHaveBeenCalledWith(root, 'n-full-42', 'reject');
  });
});

describe('makeCommandResolver — routing precedence + not-found', () => {
  it('autonomous owns the id → nervous is NOT consulted', async () => {
    seedAutonomousPending('shared-id');
    const readNervousPending = vi.fn(() => [{ id: 'shared-id' }]);
    const writeNervousApproval = vi.fn(async () => {});
    const resolve = makeCommandResolver(root, { readNervousPending, writeNervousApproval });
    expect(await resolve('shared-id', 'approve')).toBe('resolved');
    expect(writeNervousApproval).not.toHaveBeenCalled();
  });

  it('neither gate owns the id → not-found', async () => {
    const resolve = makeCommandResolver(root);
    expect(await resolve('ghost', 'approve')).toBe('not-found');
  });
});
