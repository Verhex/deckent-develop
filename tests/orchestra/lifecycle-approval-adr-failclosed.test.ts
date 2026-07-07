// ═══ LIFECYCLE-CRITICAL-2 (sprint-380 task 380-002) ═══════════════════════
// Two default-ON CRITICAL failures from the born-559 audit:
//  1. `waitForHumanApproval` used to `while(true)` poll a human-checkpoint
//     with NO timeout — a lost/forgotten approval request hung the sprint
//     forever. Fixed: bounded timeout + escalation, parks (resolves false)
//     instead of hanging.
//  2. `enforceAdrCompliance`'s outer catch (the enforcer's OWN internal
//     crash, not a per-file read miss) used to return `pass:true` —
//     fail-OPEN, silently disabling the ADR compliance gate exactly when
//     something was already broken. Fixed: fail-CLOSED (`pass:false` +
//     a surfaced violation/alert).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  waitForHumanApproval,
  resetInterruptState,
} from '../../src/orchestra/sprint-lifecycle.js';
import { enforceAdrCompliance } from '../../src/orchestra/authority-enforcer.js';

function checkpointFilePath(projectRoot: string, sprintId: string, phase: string): string {
  return join(projectRoot, '.deckent', 'checkpoints', `checkpoint-${sprintId}-${phase}.json`);
}

interface CheckpointFileShape {
  phase: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  createdAt: string;
}

describe('waitForHumanApproval — bounded timeout (LIFECYCLE-CRITICAL-2)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lifecycle-approval-'));
    resetInterruptState();
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  it('never hangs: a lost/forgotten approval times out and resolves false within the bounded window', async () => {
    const startedAt = Date.now();

    const result = await waitForHumanApproval(
      tmpDir,
      'sprint-380',
      'plan',
      'Onay simülasyonu — asla approve/reject edilmiyor',
      { timeoutMs: 70, pollIntervalMs: 15, escalationIntervalMs: 10_000 },
    );

    const elapsedMs = Date.now() - startedAt;

    // Must resolve at all (no infinite hang) and well under a generous ceiling
    // — proves the wait is bounded, not "eventually" bounded by luck.
    expect(result).toBe(false);
    expect(elapsedMs).toBeLessThan(5_000);
  });

  it('marks the checkpoint file "timeout" (distinct from an explicit rejection) when the bound is reached', async () => {
    await waitForHumanApproval(
      tmpDir,
      'sprint-380',
      'evaluate',
      'Onay simülasyonu — kayıp onay',
      { timeoutMs: 60, pollIntervalMs: 15, escalationIntervalMs: 10_000 },
    );

    const cpPath = checkpointFilePath(tmpDir, 'sprint-380', 'evaluate');
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, 'utf-8')) as CheckpointFileShape;
    expect(cp.status).toBe('timeout');
  });

  it('still resolves true when approved mid-poll (regression guard)', async () => {
    const pending = waitForHumanApproval(
      tmpDir,
      'sprint-380',
      'fix',
      'Onay simülasyonu — onaylanacak',
      { timeoutMs: 3_000, pollIntervalMs: 10, escalationIntervalMs: 10_000 },
    );

    // Let the checkpoint file get written, then approve it out-of-band —
    // mirrors what `deckent checkpoint approve` does on disk.
    await new Promise(resolve => setTimeout(resolve, 30));
    const cpPath = checkpointFilePath(tmpDir, 'sprint-380', 'fix');
    const cp = JSON.parse(readFileSync(cpPath, 'utf-8')) as CheckpointFileShape;
    cp.status = 'approved';
    writeFileSync(cpPath, JSON.stringify(cp, null, 2), 'utf-8');

    await expect(pending).resolves.toBe(true);
  });

  it('still resolves false when rejected mid-poll, without overwriting the rejection as "timeout" (regression guard)', async () => {
    const pending = waitForHumanApproval(
      tmpDir,
      'sprint-380',
      'plan',
      'Onay simülasyonu — reddedilecek',
      { timeoutMs: 3_000, pollIntervalMs: 10, escalationIntervalMs: 10_000 },
    );

    await new Promise(resolve => setTimeout(resolve, 30));
    const cpPath = checkpointFilePath(tmpDir, 'sprint-380', 'plan');
    const cp = JSON.parse(readFileSync(cpPath, 'utf-8')) as CheckpointFileShape;
    cp.status = 'rejected';
    writeFileSync(cpPath, JSON.stringify(cp, null, 2), 'utf-8');

    await expect(pending).resolves.toBe(false);

    const finalCp = JSON.parse(readFileSync(cpPath, 'utf-8')) as CheckpointFileShape;
    expect(finalCp.status).toBe('rejected');
  });
});

describe('enforceAdrCompliance — fail-CLOSED on internal crash (LIFECYCLE-CRITICAL-2)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'authority-enforcer-failclosed-'));
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  it('fails CLOSED (pass:false) when the enforcer itself crashes — not fail-open', () => {
    // `changedFiles: null` throws synchronously inside the `for...of` loop —
    // OUTSIDE the per-file try/catch (which only wraps the readFileSync call
    // for a SINGLE already-iterated file). This exercises the enforcer's own
    // internal-crash path through the real public API, not a per-file miss
    // (which legitimately stays fail-open/skip — see the sibling
    // 'missing files gracefully' case in layer4-runtime.test.ts).
    const result = enforceAdrCompliance(
      tmpDir,
      'sprint-380',
      'T-380-002',
      null as unknown as string[],
    );

    expect(result.pass).toBe(false);
    expect(result.enforcerError).toBeDefined();
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].adrId).toBe('enforcer-internal-error');
    expect(result.violations[0].description).toContain(result.enforcerError as string);
  });
});
