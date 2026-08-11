import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runXverifyForResult, XverifyInvocationError } from '../../src/cli/commands/xverify.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type { ResolvedConfig } from '../../src/core/types.js';

// row 340 fix: `--files` now actually scopes what it documents, empty evidence
// produces a typed actionable remedy, and `--target path:START-END|path:symbol`
// lets a claim point at an exact excerpt of a large file instead of manual
// prompt surgery. This file covers those three UX contracts.

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
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
    projectName: 'xverify-ux-test',
    projectRoot: '/unused',
    version: '1.0.0',
    auto_docs: { tier1: false, tier2: false, tier3: false },
  } as ResolvedConfig;
}

const stubRunner = vi.fn(async () => ({
  outcome: 'unavailable' as const,
  disposition: 'hold' as const,
  ran: false,
  skippedReason: 'stub',
  refuted: false,
  blocked: false,
}));

describe('xverify UX — --files honesty', () => {
  it('scopes captureDiffFn to exactly the trimmed --files paths, duplicates included', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-files-'));
    roots.push(root);
    const captureDiffFn = vi.fn((_root: string, files?: readonly string[]) => `diff:${(files ?? []).join('|')}`);

    await runXverifyForResult('Assess the bounded evidence.', {
      author: 'claude',
      verifier: 'codex',
      diff: true,
      files: ' src/core/a.ts , src/core/a.ts ,src/core/b.ts ',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      captureDiffFn,
      runCrossVerifyFn: stubRunner,
    });

    expect(captureDiffFn).toHaveBeenCalledWith(root, ['src/core/a.ts', 'src/core/a.ts', 'src/core/b.ts']);
  });

  it('dedups --files into task.scope.filesRead without dropping any distinct path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-files-dedup-'));
    roots.push(root);
    let observedFilesRead: string[] | undefined;

    await runXverifyForResult('Assess the bounded evidence.', {
      author: 'claude',
      verifier: 'codex',
      files: 'src/core/a.ts,src/core/a.ts,src/core/b.ts',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(async (...args) => {
        observedFilesRead = (args[1] as { scope: { filesRead: string[] } }).scope.filesRead;
        return {
          outcome: 'unavailable' as const,
          disposition: 'hold' as const,
          ran: false,
          skippedReason: 'stub',
          refuted: false,
          blocked: false,
        };
      }),
    });

    expect(observedFilesRead).toEqual(['src/core/a.ts', 'src/core/b.ts']);
  });
});

describe('xverify UX — empty-evidence remedy', () => {
  it('reports a typed i18n remedy when no --files/--diff/--target were given', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-no-evidence-'));
    roots.push(root);

    const result = await runXverifyForResult('Self-contained logical claim.', {
      author: 'claude',
      verifier: 'codex',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: stubRunner,
    });

    const expectedRemedy = getMessage('xverify.remedy.no_evidence', 'en');
    expect(result.remedy).toBe(expectedRemedy);
    expect(result.blocked).toBe(false); // guidance, never a refusal
    const report = readFileSync(result.report, 'utf-8');
    expect(report).toContain(`**Remedy:** ${expectedRemedy}`);
  });

  it('leaves remedy null once any evidence (files/diff/target) is attached', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-has-evidence-'));
    roots.push(root);

    const result = await runXverifyForResult('Claim with evidence.', {
      author: 'claude',
      verifier: 'codex',
      files: 'src/core/a.ts',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: stubRunner,
    });

    expect(result.remedy).toBeNull();
    const report = readFileSync(result.report, 'utf-8');
    expect(report).not.toContain('**Remedy:**');
  });

  it('still surfaces the remedy when the runner independently flags evidence as missing, even though evidence was attached', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-runner-flags-'));
    roots.push(root);

    const result = await runXverifyForResult('Claim the runner rejects as unevidenced.', {
      author: 'claude',
      verifier: 'codex',
      files: 'src/core/a.ts',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(async () => ({
        outcome: 'unavailable' as const,
        disposition: 'hold' as const,
        ran: false,
        skippedReason: 'verifier-eligibility-evidence-missing',
        refuted: false,
        blocked: false,
      })),
    });

    expect(result.remedy).toBe(getMessage('xverify.remedy.no_evidence', 'en'));
  });
});

describe('xverify UX — bounded --target', () => {
  function writeFixture(root: string): string {
    const relPath = 'fixture.ts';
    writeFileSync(join(root, relPath), [
      'const unrelated = 0;',
      'const before = 1;',
      'function target() {',
      '  return 42;',
      '}',
      'const after = 2;',
      'const bareStatement = 3;',
    ].join('\n'), 'utf-8');
    return relPath;
  }

  it('extracts an exact 1-based inclusive line range', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-target-range-'));
    roots.push(root);
    const relPath = writeFixture(root);
    let evidenceContext: string | undefined;

    const result = await runXverifyForResult('Assess lines 2-4.', {
      author: 'claude',
      verifier: 'codex',
      target: `${relPath}:2-4`,
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(async (_root, _task, resultArg) => {
        evidenceContext = (resultArg as typeof resultArg & { evidenceContext?: string }).evidenceContext;
        return {
          outcome: 'unavailable' as const,
          disposition: 'hold' as const,
          ran: false,
          skippedReason: 'stub',
          refuted: false,
          blocked: false,
        };
      }),
    });

    expect(result.remedy).toBeNull(); // a target counts as attached evidence
    expect(evidenceContext).toContain(`### Target: ${relPath} (lines 2-4)`);
    expect(evidenceContext).toContain('const before = 1;');
    expect(evidenceContext).toContain('function target() {');
    expect(evidenceContext).not.toContain('const unrelated = 0;');
    expect(evidenceContext).not.toContain('const after = 2;');
  });

  it('extracts a brace-balanced symbol block', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-target-symbol-'));
    roots.push(root);
    const relPath = writeFixture(root);
    let evidenceContext: string | undefined;

    await runXverifyForResult('Assess the target() function.', {
      author: 'claude',
      verifier: 'codex',
      target: `${relPath}:target`,
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(async (_root, _task, resultArg) => {
        evidenceContext = (resultArg as typeof resultArg & { evidenceContext?: string }).evidenceContext;
        return {
          outcome: 'unavailable' as const,
          disposition: 'hold' as const,
          ran: false,
          skippedReason: 'stub',
          refuted: false,
          blocked: false,
        };
      }),
    });

    expect(evidenceContext).toContain(`### Target: ${relPath} (symbol target (lines 3-5))`);
    expect(evidenceContext).toContain('function target() {');
    expect(evidenceContext).toContain('  return 42;');
    expect(evidenceContext).not.toContain('const after = 2;');
  });

  it('extracts a brace-less one-liner symbol as a single line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-target-oneliner-'));
    roots.push(root);
    const relPath = writeFixture(root);
    let evidenceContext: string | undefined;

    await runXverifyForResult('Assess bareStatement.', {
      author: 'claude',
      verifier: 'codex',
      target: `${relPath}:bareStatement`,
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(async (_root, _task, resultArg) => {
        evidenceContext = (resultArg as typeof resultArg & { evidenceContext?: string }).evidenceContext;
        return {
          outcome: 'unavailable' as const,
          disposition: 'hold' as const,
          ran: false,
          skippedReason: 'stub',
          refuted: false,
          blocked: false,
        };
      }),
    });

    expect(evidenceContext).toContain(`### Target: ${relPath} (symbol bareStatement (lines 7-7))`);
    expect(evidenceContext).toContain('const bareStatement = 3;');
  });

  it('dedups a target path already present via --files into a single scope entry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-target-dedup-'));
    roots.push(root);
    const relPath = writeFixture(root);
    let observedFilesRead: string[] | undefined;

    await runXverifyForResult('Assess target + files overlap.', {
      author: 'claude',
      verifier: 'codex',
      files: relPath,
      target: `${relPath}:2-4`,
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(async (...args) => {
        observedFilesRead = (args[1] as { scope: { filesRead: string[] } }).scope.filesRead;
        return {
          outcome: 'unavailable' as const,
          disposition: 'hold' as const,
          ran: false,
          skippedReason: 'stub',
          refuted: false,
          blocked: false,
        };
      }),
    });

    expect(observedFilesRead).toEqual([relPath]);
  });

  it('rejects a malformed --target spec with the exact i18n catalog message, before any spawn', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-target-malformed-'));
    roots.push(root);
    const runCrossVerifyFn = vi.fn();

    await expect(runXverifyForResult('Malformed target.', {
      author: 'claude',
      verifier: 'codex',
      target: 'no-colon-here',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn,
    })).rejects.toThrow(
      new XverifyInvocationError(getMessage('xverify.err.target_invalid_spec', 'en', { spec: 'no-colon-here' })),
    );
    expect(runCrossVerifyFn).not.toHaveBeenCalled();
  });

  it('rejects a --target pointing at a nonexistent file with the exact i18n catalog message', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-target-missing-file-'));
    roots.push(root);

    await expect(runXverifyForResult('Missing file target.', {
      author: 'claude',
      verifier: 'codex',
      target: 'does/not/exist.ts:1-2',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(),
    })).rejects.toThrow(
      new XverifyInvocationError(getMessage('xverify.err.target_file_not_found', 'en', { path: 'does/not/exist.ts' })),
    );
  });

  it('rejects an out-of-range --target line range with the exact i18n catalog message', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-target-range-invalid-'));
    roots.push(root);
    const relPath = writeFixture(root);

    await expect(runXverifyForResult('Out-of-range target.', {
      author: 'claude',
      verifier: 'codex',
      target: `${relPath}:5-100`,
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(),
    })).rejects.toThrow(
      new XverifyInvocationError(getMessage('xverify.err.target_range_invalid', 'en', {
        path: relPath, start: '5', end: '100', total: '7',
      })),
    );
  });

  it('rejects a --target symbol that does not appear in the file with the exact i18n catalog message', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-target-symbol-missing-'));
    roots.push(root);
    const relPath = writeFixture(root);

    await expect(runXverifyForResult('Unknown symbol target.', {
      author: 'claude',
      verifier: 'codex',
      target: `${relPath}:doesNotExist`,
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(),
    })).rejects.toThrow(
      new XverifyInvocationError(getMessage('xverify.err.target_symbol_not_found', 'en', {
        symbol: 'doesNotExist', path: relPath,
      })),
    );
  });
});
