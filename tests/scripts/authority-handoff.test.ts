// ─── authority-handoff.mjs — receipt-chain mechanics pins ───────────────────
//
// Pins the TOOL's mechanical guarantees (the contract itself lives in
// fallback-rules/authority-handoff.md): (1) digest is canonical-key-sorted and
// tamper-evident; (2) receipts are create-only; (3) transition order is
// enforced (verify needs PREPARED, commit needs VERIFIED); (4) recovery-commit
// demands an explicit owner authority-ref. Real-binary: the CLI itself runs.

import { describe, expect, it, onTestFinished } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const SCRIPT = join(REPO, 'scripts', 'authority-handoff.mjs');

/** Hermetic sandbox: a tiny git repo with the script + policy-lint stub. */
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'handoff-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(SCRIPT, join(root, 'scripts', 'authority-handoff.mjs'));
  // Policy-digest stub — the tool shells `node scripts/lint-operating-policy.mjs --digest`.
  const stub = `console.log('[operating-policy] active DECKENT-DEV-CONTROL digest sha256=${'a'.repeat(64)}');`;
  require('node:fs').writeFileSync(join(root, 'scripts', 'lint-operating-policy.mjs'), stub);
  const git = (args: string[]) => execFileSync('git', args, { cwd: root });
  git(['init', '-q']);
  git(['config', 'user.email', 't@t']);
  git(['config', 'user.name', 't']);
  require('node:fs').writeFileSync(join(root, 'seed.txt'), 'seed\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'seed']);
  return root;
}

function run(root: string, args: string[], expectFail = false): string {
  try {
    return execFileSync('node', [join(root, 'scripts', 'authority-handoff.mjs'), ...args], {
      cwd: root, encoding: 'utf-8',
    });
  } catch (error: any) {
    if (expectFail) return `${error.stdout ?? ''}${error.stderr ?? ''}`;
    throw error;
  }
}

const PREPARE_ARGS = [
  'prepare', '--handoff', 'ah-test-01', '--outcome', 'TEST-OUTCOME-001',
  '--includes', 'the approved outcome', '--open-actions', 'a|b|c',
  '--next-action', 'do a', '--reason', 'PROVIDER_LIMIT_OR_CAPACITY',
  '--from-provider', 'claude', '--from-model', 'claude-fable-5',
  '--to-provider', 'codex', '--to-model', 'gpt-5.6-sol',
];

describe('authority-handoff receipt chain', () => {
  it('prepare → verify → commit chains digests and enforces create-only', () => {
    const root = sandbox();
    const prepared = JSON.parse(run(root, PREPARE_ARGS));
    expect(prepared.receiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Create-only: a second PREPARED for the same handoff is refused.
    expect(run(root, PREPARE_ARGS, true)).toContain('EPOCH_CONFLICT');

    const verified = JSON.parse(run(root, ['verify', '--handoff', 'ah-test-01']));
    expect(verified.transition).toBe('VERIFIED');
    const committed = JSON.parse(run(root, ['commit', '--handoff', 'ah-test-01']));
    expect(committed.transition).toBe('COMMITTED');

    const dir = join(root, 'docs', 'execution', 'handoffs', 'ah-test-01');
    const files = readdirSync(dir).sort();
    expect(files).toEqual(['0001-prepared.json', '0002-verified.json', '0003-committed.json']);
    const c = JSON.parse(readFileSync(join(dir, '0003-committed.json'), 'utf-8'));
    const v = JSON.parse(readFileSync(join(dir, '0002-verified.json'), 'utf-8'));
    expect(c.authorityHandoff.previousReceiptDigest).toBe(v.receiptDigest);
    expect(c.authorityHandoff.transitionActor).toBe('transferor');
  });

  it('enforces transition order and tamper-evidence', () => {
    const root = sandbox();
    // commit without any receipts → chain incomplete.
    expect(run(root, ['commit', '--handoff', 'ah-none'], true)).toContain('RECEIPT_CHAIN_INCOMPLETE');
    run(root, PREPARE_ARGS);
    // commit straight from PREPARED (skipping VERIFIED) → refused.
    expect(run(root, ['commit', '--handoff', 'ah-test-01'], true)).toContain('EPOCH_CONFLICT');
    // Tamper the receipt → digest mismatch on next read.
    const p = join(root, 'docs', 'execution', 'handoffs', 'ah-test-01', '0001-prepared.json');
    const receipt = JSON.parse(readFileSync(p, 'utf-8'));
    receipt.outcomeId = 'TAMPERED';
    require('node:fs').writeFileSync(p, JSON.stringify(receipt, null, 2) + '\n');
    expect(run(root, ['verify', '--handoff', 'ah-test-01'], true)).toContain('RECEIPT_DIGEST_MISMATCH');
  });

  it('recovery-commit demands an explicit owner authority-ref', () => {
    const root = sandbox();
    run(root, PREPARE_ARGS);
    expect(run(root, ['recovery-commit', '--handoff', 'ah-test-01'], true))
      .toContain('OWNER_AUTHORITY_REQUIRED');
    const out = JSON.parse(run(root, [
      'recovery-commit', '--handoff', 'ah-test-01', '--authority-ref', 'owner-live-2026-08-21-recovery',
    ]));
    expect(out.transition).toBe('RECOVERY_COMMITTED');
  });
});
