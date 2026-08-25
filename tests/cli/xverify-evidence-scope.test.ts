import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runXverifyForResult } from '../../src/cli/commands/xverify.js';
import { CROSS_VERIFY_EVIDENCE_MAX_FILE_BYTES } from '../../src/core/cross-verify-evidence-broker.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 1,
      brain_model: 'claude-fable-5',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
      brain_planning: 'structured',
    },
    modes: {},
    language: 'en',
    projectName: 'xverify-evidence-scope-test',
    projectRoot: '/unused',
    version: '1.0.0',
    auto_docs: { tier1: false, tier2: false, tier3: false },
  } as ResolvedConfig;
}

function makeGitRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-evidence-'));
  roots.push(root);
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  writeFileSync(join(root, 'changed.ts'), 'export const value = 1;\n');
  execFileSync('git', ['add', 'changed.ts'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root });
  writeFileSync(join(root, 'changed.ts'), 'export const value = 2;\n');
  return root;
}

const unavailableOutcome = {
  outcome: 'unavailable' as const,
  disposition: 'hold' as const,
  ran: false,
  skippedReason: 'stub',
  refuted: false,
  blocked: false,
};

async function runWithObservedTask(
  root: string,
  opts: { diff?: boolean; files?: string },
): Promise<{ filesRead: string[]; filesChanged: string[]; remedy: string | null }> {
  let filesRead: string[] = [];
  let filesChanged: string[] = [];
  const result = await runXverifyForResult('Assess evidence scope.', {
    author: 'claude',
    verifier: 'codex',
    ...opts,
  }, {
    resolveProjectRootFn: () => root,
    loadConfigFn: async () => makeConfig(),
    bootstrapProvidersFn: async () => undefined,
    runCrossVerifyFn: vi.fn(async (...args) => {
      filesRead = (args[1] as { scope: { filesRead: string[] } }).scope.filesRead;
      filesChanged = (args[2] as { filesChanged: string[] }).filesChanged;
      return unavailableOutcome;
    }),
  });
  return { filesRead, filesChanged, remedy: result.remedy };
}

describe('xverify diff evidence scope', () => {
  it('passes changed paths from --diff into bootstrap evidence scope', async () => {
    const observed = await runWithObservedTask(makeGitRoot(), { diff: true });

    expect(observed.filesRead).toEqual(['changed.ts']);
    expect(observed.filesChanged).toEqual(['changed.ts']);
  });

  it('filters broker-inadmissible (oversize) files out of the derived diff paths', async () => {
    // Live incident 2026-08-26: a dirty 2MB+ runtime .db in the working tree
    // rode the derived list into the broker and produced a hard
    // xverify_v2_bootstrap_failed hold for the whole verification.
    const root = makeGitRoot();
    const big = join(root, 'huge.db');
    writeFileSync(big, Buffer.alloc(CROSS_VERIFY_EVIDENCE_MAX_FILE_BYTES + 1));
    execFileSync('git', ['add', 'huge.db'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'big'], { cwd: root });
    writeFileSync(big, Buffer.alloc(CROSS_VERIFY_EVIDENCE_MAX_FILE_BYTES + 2));

    const observed = await runWithObservedTask(root, { diff: true });

    expect(observed.filesRead).toEqual(['changed.ts']); // huge.db elenir
  });

  it('preserves --files paths and unions them with deduplicated diff paths', async () => {
    const observed = await runWithObservedTask(makeGitRoot(), {
      diff: true,
      files: 'explicit.ts,changed.ts',
    });

    expect(observed.filesRead).toEqual(['explicit.ts', 'changed.ts']);
    expect(observed.filesChanged).toEqual(['explicit.ts', 'changed.ts']);
  });

  it('does not suppress the remedy when neither --files nor --diff is present', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-no-evidence-'));
    roots.push(root);

    const observed = await runWithObservedTask(root, {});

    expect(observed.remedy).toBe(getMessage('xverify.remedy.no_evidence', 'en'));
  });
});
