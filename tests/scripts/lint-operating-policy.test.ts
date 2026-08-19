import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  checkOperatingPolicy,
  writeHostBlocks,
  normalizeBlock,
  sha256Hex,
  findMasterRowState,
  parseControlBlock,
  controlValuesDigest,
  CONTROL_KEYS,
  CANONICAL_RELATIVE_PATH,
  HOST_RELATIVE_PATHS,
  ACTIVE_DIR_RELATIVE_PATH,
  MASTER_RELATIVE_PATH,
} from '../../scripts/lint-operating-policy.mjs';

const BLOCK = [
  '## Deckent-dev Execution Mode (operating policy projection)',
  '',
  '- Only Alperen changes the mode.',
  '- One ACTIVE product outcome at a time.',
].join('\n');

const DECISION_REF = 'owner-live-2026-08-17-direct-main';

const CONTROL_VALUES: Record<string, string> = {
  SCHEMA_VERSION: '1',
  DOGFOOD_MODE: 'OFF',
  WORKSPACE_MODE: 'MAIN',
  DELIVERY_MODE: 'DIRECT_MAIN',
  PR_REQUIRED: 'false',
  MERGE_QUEUE_REQUIRED: 'false',
  REMOTE_CI_MODE: 'ADVISORY',
  LOCAL_VERIFICATION_MODE: 'REQUIRED',
  EXECUTION_AUTHORITY: 'FABLE',
  ANALYSIS_AUTHORITY: 'CODEX',
  OWNER_AUTHORITY: 'ALPEREN',
  DECISION_REF,
};

function controlBlock(overrides: Record<string, string | null> = {}, extraLine?: string): string {
  const lines = (CONTROL_KEYS as readonly string[])
    .map((k) => (overrides[k] === null ? null : `${k}=${overrides[k] ?? CONTROL_VALUES[k]}`))
    .filter((l): l is string => l !== null);
  if (extraLine) lines.push(extraLine);
  return `<!-- DECKENT-DEV-CONTROL:START -->\n${lines.join('\n')}\n<!-- DECKENT-DEV-CONTROL:END -->`;
}

function canonicalDoc(inner: string): string {
  return `# Policy\n\ngiris (DECISION_REF=${DECISION_REF})\n\n<!-- HOST-BLOCK:START -->\n${inner}\n<!-- HOST-BLOCK:END -->\n\nson\n`;
}

function hostDoc(inner: string, control: string = controlBlock()): string {
  return `# Host\n\n${control}\n\n<!-- OPERATING-POLICY:START source=${CANONICAL_RELATIVE_PATH} -->\n${inner}\n<!-- OPERATING-POLICY:END -->\n`;
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
      // Cursor host lives under .cursor/rules/ — nested host paths need their dir.
      mkdirSync(dirname(join(root, host)), { recursive: true });
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

  describe('DECKENT-DEV-CONTROL machine-readable mode block', () => {
    it('passes with byte-identical twin blocks and reports the control digest', () => {
      const result = checkOperatingPolicy(root);
      expect(result.problems).toEqual([]);
      expect(result.controlDigest).toBe(controlValuesDigest(CONTROL_VALUES));
    });

    it('flags DEV_CONTROL_BLOCK_MISSING when one host lacks the block', () => {
      writeFileSync(join(root, 'AGENTS.md'), hostDoc(BLOCK, '').replace(/\n\n\n/, '\n\n'), 'utf-8');
      const codes = checkOperatingPolicy(root).problems.map((p) => p.code);
      expect(codes).toContain('DEV_CONTROL_BLOCK_MISSING');
    });

    it('flags unknown, duplicate and missing fields with typed codes', () => {
      writeFileSync(
        join(root, 'AGENTS.md'),
        hostDoc(BLOCK, controlBlock({ OWNER_AUTHORITY: null }, 'ROGUE_KEY=x\nDOGFOOD_MODE=OFF')),
        'utf-8',
      );
      const codes = checkOperatingPolicy(root).problems.map((p) => p.code);
      expect(codes).toContain('DEV_CONTROL_UNKNOWN_FIELD');
      expect(codes).toContain('DEV_CONTROL_DUPLICATE_FIELD');
      expect(codes).toContain('DEV_CONTROL_MISSING_FIELD');
    });

    it('flags a strict enum violation as DEV_CONTROL_INVALID_VALUE', () => {
      writeFileSync(join(root, 'AGENTS.md'), hostDoc(BLOCK, controlBlock({ DOGFOOD_MODE: 'MAYBE' })), 'utf-8');
      const problems = checkOperatingPolicy(root).problems;
      expect(problems.map((p) => p.code)).toContain('DEV_CONTROL_INVALID_VALUE');
      expect(problems.find((p) => p.code === 'DEV_CONTROL_INVALID_VALUE')?.detail).toContain('DOGFOOD_MODE');
    });

    it('flags canonical key-order violation as DEV_CONTROL_KEY_ORDER', () => {
      const swapped = controlBlock()
        .replace('SCHEMA_VERSION=1\nDOGFOOD_MODE=OFF', 'DOGFOOD_MODE=OFF\nSCHEMA_VERSION=1');
      writeFileSync(join(root, 'AGENTS.md'), hostDoc(BLOCK, swapped), 'utf-8');
      const codes = checkOperatingPolicy(root).problems.map((p) => p.code);
      expect(codes).toContain('DEV_CONTROL_KEY_ORDER');
    });

    it('flags twin drift when AGENTS and CLAUDE blocks are not byte-identical', () => {
      writeFileSync(join(root, 'CLAUDE.md'), hostDoc(BLOCK, controlBlock({ EXECUTION_AUTHORITY: 'CODEX' })), 'utf-8');
      const codes = checkOperatingPolicy(root).problems.map((p) => p.code);
      expect(codes).toContain('DEV_CONTROL_BLOCK_DRIFT');
    });

    it('flags a surviving unconditional legacy DOGFOOD-MANDATORY token', () => {
      writeFileSync(join(root, 'AGENTS.md'), `${hostDoc(BLOCK)}\n- **DOGFOOD-MANDATORY.** eski kosulsuz kural\n`, 'utf-8');
      const codes = checkOperatingPolicy(root).problems.map((p) => p.code);
      expect(codes).toContain('DEV_CONTROL_LEGACY_DOGFOOD_CONFLICT');
    });

    it('flags DECISION_REF not anchored in the canonical policy', () => {
      writeFileSync(join(root, CANONICAL_RELATIVE_PATH), canonicalDoc(BLOCK).replace(DECISION_REF, 'baska-bir-ref'), 'utf-8');
      const codes = checkOperatingPolicy(root).problems.map((p) => p.code);
      expect(codes).toContain('DEV_CONTROL_DECISION_REF_UNANCHORED');
    });

    it('parseControlBlock returns found:false without markers', () => {
      expect(parseControlBlock('# no block here\n')).toEqual({ found: false });
    });
  });
});
