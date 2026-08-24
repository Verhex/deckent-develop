import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  readRecommendations,
  recordRecommendation,
  RECOMMENDATIONS_FILE,
} from '../../src/nervous/recommendation-log.js';

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/nervous/observer.js', () => ({
  getActiveDirectivesProtection: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/cli/commands/config-nervous.js', () => ({
  handleEnableNervous: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

import { printError } from '../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { registerNervous } from '../../src/cli/commands/nervous.js';

interface PersistedRecommendationDisposition {
  readonly status: string;
  readonly disposition?: {
    readonly decision: string;
    readonly decidedAt: string;
    readonly decidedBy: string;
    readonly reason?: string;
  };
}

async function runCommand(root: string, args: string[]): Promise<void> {
  vi.mocked(resolveProjectRoot).mockReturnValue(root);
  const program = new Command();
  program.exitOverride();
  registerNervous(program);
  await program.parseAsync(['node', 'deckent', 'nervous', ...args]);
}

function readPersisted(root: string): PersistedRecommendationDisposition {
  const line = readFileSync(join(root, RECOMMENDATIONS_FILE), 'utf-8')
    .split('\n')
    .find(Boolean);
  if (!line) throw new Error('expected a persisted recommendation');
  return JSON.parse(line) as PersistedRecommendationDisposition;
}

describe('nervous accept/reject recommendation resolution', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nervous-rec-accept-'));
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts a SPRINT_START recommendation from its recommendation store', async () => {
    const recommendation = recordRecommendation(root, 'SPRINT_START', {
      operation: 'resume-paused-run',
      sprintId: 'sprint-661',
    });

    await runCommand(root, ['accept', recommendation.id]);

    const persisted = readPersisted(root);
    expect(persisted.status).toBe('dismissed');
    expect(persisted.disposition).toMatchObject({
      decision: 'accepted',
      decidedBy: 'user',
    });
    expect(persisted.disposition?.decidedAt).toEqual(expect.any(String));
    expect(readRecommendations(root).filter((item) => item.status === 'open')).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('rejects a recommendation by unique prefix and durably records its reason', async () => {
    const recommendation = recordRecommendation(root, 'SPRINT_START', {
      operation: 'resume-paused-run',
      sprintId: 'sprint-661',
    });

    await runCommand(root, [
      'reject',
      recommendation.id.slice(0, 16),
      '--reason',
      'run remains paused',
    ]);

    expect(readPersisted(root).disposition).toMatchObject({
      decision: 'rejected',
      decidedBy: 'user',
      reason: 'run remains paused',
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('preserves the typed unknown-id rejection when neither store has the id', async () => {
    await runCommand(root, ['accept', 'rec-unknown']);

    expect(printError).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
  });
});
