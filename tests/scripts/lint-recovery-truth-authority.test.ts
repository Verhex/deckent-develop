import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkRecoveryTruthAuthority } from '../../scripts/lint-recovery-truth-authority.mjs';

describe('lint-recovery-truth-authority', () => {
  let root: string;
  const write = (file: string, source: string): void => {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source, 'utf8');
  };
  const codes = (): string[] => checkRecoveryTruthAuthority(root).problems.map(problem => problem.code);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'recovery-truth-ratchet-'));
    write('src/orchestra/recovery-controller.ts', [
      'export function replay(receipt: unknown) { return verifyReceipt(receipt); }',
      'export function bounded(generation: string) { return listRecoveryPage({ generation, limit: 100 }); }',
    ].join('\n'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('accepts canonical verification and bounded recovery paging', () => {
    expect(checkRecoveryTruthAuthority(root)).toEqual({ ok: true, problems: [] });
  });

  it.each([
    ['writeFileSync(taskResultPath, JSON.stringify(result));', 'DIRECT_TASK_RESULT_WRITER'],
    ["if (exitCode === 0) { result.status = 'DONE'; }", 'EXIT_CODE_SUCCESS_AUTHORITY'],
    ["rmSync(checkpointFiles, { force: true });", 'CHECKPOINT_GLOB_CLEAR'],
    ['renameSync(checkpointPath, archivePath);', 'CHECKPOINT_ARCHIVE_AS_SETTLEMENT'],
    ['finalizeSprint(staleGate);', 'STALE_GATE_REUSE'],
    ['const recoveryProposal = readFileSync(path); return recoveryProposal;', 'UNCONSUMED_RECOVERY_PROPOSAL'],
    ['reEvaluateRecoveryReceipt(receipt);', 'RECEIPT_REEVALUATION'],
    ["globSync('recovery/**');", 'UNBOUNDED_RECOVERY_SCAN'],
    ["readdirSync(recoveryRoot, { recursive: true });", 'UNBOUNDED_RECOVERY_SCAN'],
  ])('deterministically rejects seeded violation: %s', (source, code) => {
    write('src/orchestra/recovery-finalizer.ts', source);
    const first = checkRecoveryTruthAuthority(root);
    expect(codes()).toContain(code);
    expect(checkRecoveryTruthAuthority(root)).toEqual(first);
  });

  it('is syntax-aware and ignores comments, strings, and unrelated modules', () => {
    write('src/orchestra/recovery-notes.ts', [
      '// writeFileSync(taskResultPath, result)',
      "const prose = \"finalizeSprint(staleGate); globSync('recovery/**')\";",
    ].join('\n'));
    write('src/core/build-runner.ts', "if (exitCode === 0) result.status = 'DONE';");
    expect(checkRecoveryTruthAuthority(root)).toEqual({ ok: true, problems: [] });
  });

  it('fails closed on malformed recovery source', () => {
    write('src/core/recovery-reader.ts', 'export function broken( {');
    expect(codes()).toContain('RECOVERY_SOURCE_PARSE_ERROR');
  });

  it('reports stable portable paths and line numbers', () => {
    write('src/core/checkpoint-recovery.ts', "const ok = true;\nrenameSync(checkpointPath, archivePath);\n");
    expect(checkRecoveryTruthAuthority(root).problems).toEqual([
      expect.objectContaining({
        code: 'CHECKPOINT_ARCHIVE_AS_SETTLEMENT',
        file: 'src/core/checkpoint-recovery.ts',
        line: 2,
      }),
    ]);
  });

  it('exposes a fail-closed CLI with binary exit authority', () => {
    const script = resolve('scripts/lint-recovery-truth-authority.mjs');
    expect(execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' }))
      .toBe('recovery truth authority: OK\n');
    write('src/orchestra/recovery-finalizer.ts', 'finalizeSprint(precomputedProjection);');
    const failed = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('STALE_GATE_REUSE src/orchestra/recovery-finalizer.ts:1');
  });
});
