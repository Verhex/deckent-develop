import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkOperatingPolicy,
  writeHostBlocks,
  normalizeBlock,
  sha256Hex,
  findMasterRowState,
  CANONICAL_RELATIVE_PATH,
  HOST_RELATIVE_PATHS,
  ACTIVE_DIR_RELATIVE_PATH,
  MASTER_RELATIVE_PATH,
} from '../../scripts/lint-operating-policy.mjs';

const BLOCK = [
  '## Deckent-dev Execution Mode (operating policy projection)',
  '',
  '- Only Alperen changes the mode.',
  '- One outcome = one chat = one worktree = one PR.',
].join('\n');

function canonicalDoc(inner: string): string {
  return `# Policy\n\ngiris\n\n<!-- HOST-BLOCK:START -->\n${inner}\n<!-- HOST-BLOCK:END -->\n\nson\n`;
}

function hostDoc(inner: string): string {
  return `# Host\n\n<!-- OPERATING-POLICY:START source=${CANONICAL_RELATIVE_PATH} -->\n${inner}\n<!-- OPERATING-POLICY:END -->\n`;
}

function masterWithRow(id: string, state: string): string {
  return [
    '# Master',
    '',
    `| 1 | ${id} | EVERY-ENV-001 | REPO | test outcome | P0 | — | G1 | ${state} | 0/0/0/0/0/0/0 | acceptance | evidence | 2026-08-17 |`,
    '',
  ].join('\n');
}

function capsule(id: string): string {
  return [
    `OUTCOME_ID: ${id}`,
    'DOGFOOD_MODE: OFF',
    'BASE_SHA: abc123',
    '',
    '## DONE',
    '- criteria',
    '',
  ].join('\n');
}

describe('lint-operating-policy — host projection parity + capsule hygiene', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-operating-policy-'));
    mkdirSync(join(root, 'docs', 'governance'), { recursive: true });
    writeFileSync(join(root, CANONICAL_RELATIVE_PATH), canonicalDoc(BLOCK), 'utf-8');
    for (const host of HOST_RELATIVE_PATHS) {
      writeFileSync(join(root, host), hostDoc(BLOCK), 'utf-8');
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('passes and reports the canonical digest when all host blocks match', () => {
    const result = checkOperatingPolicy(root);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.digest).toBe(sha256Hex(normalizeBlock(BLOCK)));
  });

  it('normalization tolerates trailing whitespace and edge blank lines (no false drift)', () => {
    writeFileSync(join(root, 'AGENTS.md'), hostDoc(`\n${BLOCK.replace(/\n/g, '  \n')}  \n`), 'utf-8');
    const result = checkOperatingPolicy(root);
    expect(result.ok).toBe(true);
  });

  it('flags HOST_BLOCK_DRIFT for a diverged host block only on the drifted host', () => {
    writeFileSync(join(root, 'CLAUDE.md'), hostDoc(`${BLOCK}\n- rogue local extension`), 'utf-8');
    const result = checkOperatingPolicy(root);
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ code: 'HOST_BLOCK_DRIFT', file: 'CLAUDE.md' });
  });

  it('flags missing markers as typed problems', () => {
    writeFileSync(join(root, 'AGENTS.md'), '# Host without markers\n', 'utf-8');
    writeFileSync(join(root, CANONICAL_RELATIVE_PATH), '# Policy without block\n', 'utf-8');
    const codes = checkOperatingPolicy(root).problems.map((p) => p.code).sort();
    expect(codes).toContain('CANONICAL_BLOCK_MISSING');
    expect(codes).toContain('HOST_BLOCK_MISSING');
  });

  it('writeHostBlocks syncs drifted hosts back to canonical and check turns green', () => {
    writeFileSync(join(root, 'AGENTS.md'), hostDoc('stale old block'), 'utf-8');
    const { written } = writeHostBlocks(root);
    expect(written).toEqual(['AGENTS.md']);
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf-8')).toContain('Only Alperen changes the mode.');
    expect(checkOperatingPolicy(root).ok).toBe(true);
  });

  describe('capsule hygiene under docs/execution/active/', () => {
    beforeEach(() => {
      mkdirSync(join(root, ACTIVE_DIR_RELATIVE_PATH), { recursive: true });
      writeFileSync(join(root, MASTER_RELATIVE_PATH), masterWithRow('PKG-TEST-001', 'IN_PROGRESS'), 'utf-8');
    });

    it('accepts a well-formed capsule whose MASTER row is non-terminal, ignoring train files', () => {
      writeFileSync(join(root, ACTIVE_DIR_RELATIVE_PATH, 'PKG-TEST-001.md'), capsule('PKG-TEST-001'), 'utf-8');
      writeFileSync(join(root, ACTIVE_DIR_RELATIVE_PATH, 'productization-train-2026-08-17.md'), 'serbest format tren dosyasi\n', 'utf-8');
      const result = checkOperatingPolicy(root);
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it('flags a capsule with missing required fields and missing DONE section', () => {
      writeFileSync(join(root, ACTIVE_DIR_RELATIVE_PATH, 'PKG-TEST-001.md'), 'OUTCOME_ID: PKG-TEST-001\nserbest metin\n', 'utf-8');
      const codes = checkOperatingPolicy(root).problems.map((p) => p.code);
      expect(codes).toContain('CAPSULE_FIELD_MISSING');
      expect(codes).toContain('CAPSULE_DONE_SECTION_MISSING');
    });

    it('flags filename/OUTCOME_ID mismatch', () => {
      writeFileSync(join(root, ACTIVE_DIR_RELATIVE_PATH, 'yanlis-ad.md'), capsule('PKG-TEST-001'), 'utf-8');
      const codes = checkOperatingPolicy(root).problems.map((p) => p.code);
      expect(codes).toContain('CAPSULE_FILENAME_MISMATCH');
    });

    it('flags a capsule without an owner-admitted MASTER row (KANUN 4)', () => {
      writeFileSync(join(root, ACTIVE_DIR_RELATIVE_PATH, 'PKG-GHOST-001.md'), capsule('PKG-GHOST-001'), 'utf-8');
      const problems = checkOperatingPolicy(root).problems;
      expect(problems).toHaveLength(1);
      expect(problems[0].code).toBe('CAPSULE_WITHOUT_MASTER_ROW');
    });

    it('flags delete-on-consume: capsule surviving a terminal MASTER row', () => {
      writeFileSync(join(root, MASTER_RELATIVE_PATH), masterWithRow('PKG-TEST-001', 'DONE'), 'utf-8');
      writeFileSync(join(root, ACTIVE_DIR_RELATIVE_PATH, 'PKG-TEST-001.md'), capsule('PKG-TEST-001'), 'utf-8');
      const problems = checkOperatingPolicy(root).problems;
      expect(problems).toHaveLength(1);
      expect(problems[0].code).toBe('CAPSULE_DELETE_ON_CONSUME');
    });
  });

  it('findMasterRowState parses the 13-column ledger row state', () => {
    expect(findMasterRowState(masterWithRow('X-001', 'VERIFY'), 'X-001')).toEqual({ state: 'VERIFY' });
    expect(findMasterRowState(masterWithRow('X-001', 'VERIFY'), 'Y-001')).toBeNull();
  });
});
