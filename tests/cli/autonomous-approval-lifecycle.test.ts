import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleApprove, handlePending } from '../../src/cli/commands/autonomous.js';
import { makeApprovalGate } from '../../src/orchestra/autonomous/approval-adapter.js';

let root: string;
let previousDeckentHome: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cli-autonomous-lifecycle-'));
  previousDeckentHome = process.env['DECKENT_HOME'];
  const globalRoot = join(root, 'global');
  mkdirSync(globalRoot, { recursive: true });
  writeFileSync(join(globalRoot, 'config.json'), '{}\n');
  process.env['DECKENT_HOME'] = globalRoot;
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (previousDeckentHome === undefined) delete process.env['DECKENT_HOME'];
  else process.env['DECKENT_HOME'] = previousDeckentHome;
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

function seedExpired(id: string): void {
  const dir = join(root, '.deckent', 'autonomous');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pending.json'), `${JSON.stringify([{
    triggerId: id,
    action: 'autonomous.execute',
    requestedBy: 'legacy',
    enqueuedAt: '2020-01-01T00:00:00.000Z',
  }], null, 2)}\n`);
}

describe('deckent autonomous direct lifecycle parity', () => {
  it('late approve returns failure, persists timeout authority and never creates a human replay', async () => {
    seedExpired('late-cli');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await handleApprove({ triggerId: 'late-cli', root, lang: 'en' });

    expect(process.exitCode).toBe(1);
    const decisionsPath = join(root, '.deckent', 'autonomous', 'decisions.json');
    expect(existsSync(decisionsPath)).toBe(true);
    expect(JSON.parse(readFileSync(decisionsPath, 'utf8'))['late-cli']).toMatchObject({
      kind: 'timeout',
      closureReason: 'expired',
      replayAllowed: false,
    });
    expect(makeApprovalGate({ pendingPath: join(root, '.deckent', 'autonomous', 'pending.json') }).takeResolved())
      .toBeNull();
  });

  it('pending is an expiry-aware read and omits stale legacy rows', async () => {
    seedExpired('late-list');
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      output.push(String(chunk));
      return true;
    });

    await handlePending({ root, lang: 'en' });

    expect(output.join('')).not.toContain('late-list');
  });
});
