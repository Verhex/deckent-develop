// C-04 (ADR-006): the default reconciliation probes must not pass
// task-controlled strings through a shell. scope.directories is attacker-
// influenceable (DIRECTIVES / user project), so a shell metacharacter must
// be treated as a literal git pathspec argument, never executed.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultGetGitDiffStats,
  defaultRunVitestScopeCheck,
} from '../../src/orchestra/mid-sprint-adapter.js';

const sentinels: string[] = [];

afterEach(() => {
  for (const s of sentinels.splice(0)) {
    if (existsSync(s)) rmSync(s, { force: true, recursive: true });
  }
});

describe('C-04 mid-sprint-adapter shell-injection hardening', () => {
  it('defaultGetGitDiffStats does not execute shell metacharacters in scope.directories', () => {
    const sentinel = join(tmpdir(), `deckent_c04_git_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    sentinels.push(sentinel);
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-c04-'));
    sentinels.push(cwd);

    // If dirs are interpolated into a shell string, `; touch <sentinel>`
    // runs and creates the file. With spawnSync array form, git receives
    // it as a literal pathspec and the shell never sees it.
    const malicious = { directories: [`; touch ${sentinel}`] } as { directories: string[] };

    const result = defaultGetGitDiffStats(cwd, malicious as never);

    expect(existsSync(sentinel)).toBe(false);
    // Behavior preserved: graceful empty result, never throws
    expect(result).toEqual({ linesChanged: 0, filesChanged: [] });
  });

  it('defaultRunVitestScopeCheck does not execute shell metacharacters in scope dirs', () => {
    const sentinel = join(tmpdir(), `deckent_c04_vitest_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    sentinels.push(sentinel);
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-c04v-'));
    sentinels.push(cwd);

    // Crafted so the filter (startsWith 'src/'/'tests/') keeps it, then it
    // reaches the command. Shell injection would create the sentinel.
    const malicious = [`src/x; touch ${sentinel}`];

    const out = defaultRunVitestScopeCheck(cwd, malicious);

    expect(existsSync(sentinel)).toBe(false);
    expect(typeof out.passRatio).toBe('number');
    expect(typeof out.passed).toBe('boolean');
  });
});
