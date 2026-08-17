#!/usr/bin/env node
/**
 * lint-operating-policy.mjs — Deckent-dev operating-policy projection gate
 * (DEV-OPERATING-CONTRACT-001).
 *
 * Enforces, provider-neutrally, that every interactive host adapter auto-loads
 * the SAME repo-development execution contract:
 *
 * 1. HOST-BLOCK parity — the block between `<!-- HOST-BLOCK:START/END -->` in
 *    docs/governance/deckent-dev-operating-policy.md must be identical (after
 *    trailing-whitespace + edge-blank-line normalization) to the block between
 *    `<!-- OPERATING-POLICY:START/END -->` in AGENTS.md and CLAUDE.md.
 *    The canonical block's sha256 is reported so results can cite an exact
 *    policy digest.
 * 2. Outcome-capsule hygiene — every capsule under docs/execution/active/
 *    (except productization-train-*.md) declares OUTCOME_ID / DOGFOOD_MODE /
 *    BASE_SHA and a `## DONE` section, its OUTCOME_ID matches its filename,
 *    it maps to a MASTER-PLAN row (owner-admitted work only, KANUN 4), and
 *    that row is not terminal — a capsule surviving its outcome's DONE/DISPOSED
 *    violates delete-on-consume.
 *
 * Modes: --check (default) exits 1 on any violation; --write rewrites the two
 * host blocks from the canonical source (marker placement stays a human
 * decision — missing markers are an error in both modes), then re-verifies.
 * --root <path> targets another checkout (used by the hermetic tests).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const CANONICAL_RELATIVE_PATH = 'docs/governance/deckent-dev-operating-policy.md';
export const HOST_RELATIVE_PATHS = Object.freeze(['AGENTS.md', 'CLAUDE.md']);
export const ACTIVE_DIR_RELATIVE_PATH = 'docs/execution/active';
export const MASTER_RELATIVE_PATH = 'docs/MASTER-PLAN.md';

const CANONICAL_BLOCK_RE = /<!-- HOST-BLOCK:START -->\n([\s\S]*?)<!-- HOST-BLOCK:END -->/;
const HOST_BLOCK_RE = /(<!-- OPERATING-POLICY:START[^>]*-->\n)([\s\S]*?)(<!-- OPERATING-POLICY:END -->)/;
const TRAIN_FILE_RE = /^productization-train-.*\.md$/;
const CAPSULE_REQUIRED_KEYS = Object.freeze(['OUTCOME_ID', 'DOGFOOD_MODE', 'BASE_SHA']);
const MASTER_TERMINAL_STATES = new Set(['DONE', 'DISPOSED']);

/** Trailing-whitespace-per-line + edge-blank-line normalization (LF only). */
export function normalizeBlock(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/g, ''));
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/** @returns {{found: false} | {found: true, inner: string}} */
export function extractCanonicalBlock(content) {
  const m = CANONICAL_BLOCK_RE.exec(content);
  return m ? { found: true, inner: m[1] } : { found: false };
}

/** @returns {{found: false} | {found: true, inner: string}} */
export function extractHostBlock(content) {
  const m = HOST_BLOCK_RE.exec(content);
  return m ? { found: true, inner: m[2] } : { found: false };
}

/** Parse `KEY: value` capsule header lines (first match per key wins). */
export function parseCapsuleFields(content) {
  const fields = {};
  for (const key of CAPSULE_REQUIRED_KEYS) {
    const m = new RegExp(`^${key}:[ \\t]*(.+)$`, 'm').exec(content);
    if (m) fields[key] = m[1].trim();
  }
  return fields;
}

/** Find a MASTER ledger row by Work ID. @returns {null | {state: string}} */
export function findMasterRowState(masterContent, workId) {
  const re = new RegExp(`^\\| *\\d+ *\\| *${workId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} *\\|.*$`, 'm');
  const m = re.exec(masterContent);
  if (!m) return null;
  const cols = m[0].split('|').map((c) => c.trim());
  // | Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | ...
  return { state: cols[9] ?? '' };
}

/**
 * Pure gate over a checkout root.
 * @returns {{ok: boolean, digest: string | null, problems: Array<{code: string, file: string, detail: string}>}}
 */
export function checkOperatingPolicy(root) {
  const problems = [];
  const canonicalPath = join(root, CANONICAL_RELATIVE_PATH);
  let digest = null;
  let canonicalNorm = null;

  if (!existsSync(canonicalPath)) {
    problems.push({ code: 'CANONICAL_MISSING', file: CANONICAL_RELATIVE_PATH, detail: 'canonical policy file not found' });
  } else {
    const canonical = extractCanonicalBlock(readFileSync(canonicalPath, 'utf-8'));
    if (!canonical.found) {
      problems.push({ code: 'CANONICAL_BLOCK_MISSING', file: CANONICAL_RELATIVE_PATH, detail: 'HOST-BLOCK markers not found' });
    } else {
      canonicalNorm = normalizeBlock(canonical.inner);
      digest = sha256Hex(canonicalNorm);
    }
  }

  for (const hostRel of HOST_RELATIVE_PATHS) {
    const hostPath = join(root, hostRel);
    if (!existsSync(hostPath)) {
      problems.push({ code: 'HOST_MISSING', file: hostRel, detail: 'host adapter file not found' });
      continue;
    }
    const block = extractHostBlock(readFileSync(hostPath, 'utf-8'));
    if (!block.found) {
      problems.push({ code: 'HOST_BLOCK_MISSING', file: hostRel, detail: 'OPERATING-POLICY markers not found' });
      continue;
    }
    if (canonicalNorm !== null && normalizeBlock(block.inner) !== canonicalNorm) {
      problems.push({ code: 'HOST_BLOCK_DRIFT', file: hostRel, detail: `host block diverged from canonical (run --write to sync); host sha256=${sha256Hex(normalizeBlock(block.inner))}` });
    }
  }

  const activeDir = join(root, ACTIVE_DIR_RELATIVE_PATH);
  if (existsSync(activeDir)) {
    const masterPath = join(root, MASTER_RELATIVE_PATH);
    const masterContent = existsSync(masterPath) ? readFileSync(masterPath, 'utf-8') : null;
    for (const entry of readdirSync(activeDir).filter((f) => f.endsWith('.md')).sort()) {
      if (TRAIN_FILE_RE.test(entry)) continue;
      const rel = `${ACTIVE_DIR_RELATIVE_PATH}/${entry}`;
      const content = readFileSync(join(activeDir, entry), 'utf-8');
      const fields = parseCapsuleFields(content);
      for (const key of CAPSULE_REQUIRED_KEYS) {
        if (!fields[key]) problems.push({ code: 'CAPSULE_FIELD_MISSING', file: rel, detail: `required field ${key}: absent` });
      }
      if (!/^## DONE/m.test(content)) {
        problems.push({ code: 'CAPSULE_DONE_SECTION_MISSING', file: rel, detail: 'capsule has no `## DONE` criteria section' });
      }
      const outcomeId = fields.OUTCOME_ID;
      if (outcomeId) {
        if (entry !== `${outcomeId}.md`) {
          problems.push({ code: 'CAPSULE_FILENAME_MISMATCH', file: rel, detail: `filename must be ${outcomeId}.md` });
        }
        if (masterContent === null) {
          problems.push({ code: 'MASTER_MISSING', file: rel, detail: 'MASTER-PLAN.md not found for capsule admission check' });
        } else {
          const row = findMasterRowState(masterContent, outcomeId);
          if (row === null) {
            problems.push({ code: 'CAPSULE_WITHOUT_MASTER_ROW', file: rel, detail: `no MASTER row for ${outcomeId} — capsules exist only for owner-admitted work (KANUN 4)` });
          } else if (MASTER_TERMINAL_STATES.has(row.state)) {
            problems.push({ code: 'CAPSULE_DELETE_ON_CONSUME', file: rel, detail: `MASTER row ${outcomeId} is ${row.state} — consumed capsules must be deleted, not archived` });
          }
        }
      }
    }
  }

  return { ok: problems.length === 0, digest, problems };
}

/** Rewrite both host blocks from the canonical source. Markers must pre-exist. */
export function writeHostBlocks(root) {
  const canonicalPath = join(root, CANONICAL_RELATIVE_PATH);
  const canonical = extractCanonicalBlock(readFileSync(canonicalPath, 'utf-8'));
  if (!canonical.found) throw new Error('HOST-BLOCK markers not found in canonical policy');
  const written = [];
  for (const hostRel of HOST_RELATIVE_PATHS) {
    const hostPath = join(root, hostRel);
    const content = readFileSync(hostPath, 'utf-8');
    if (!HOST_BLOCK_RE.test(content)) throw new Error(`OPERATING-POLICY markers not found in ${hostRel}`);
    const next = content.replace(HOST_BLOCK_RE, (_all, start, _inner, end) => `${start}${normalizeBlock(canonical.inner)}\n${end}`);
    if (next !== content) {
      writeFileSync(hostPath, next, 'utf-8');
      written.push(hostRel);
    }
  }
  return { written };
}

function isMain() {
  try { return import.meta.url === new URL(`file://${process.argv[1]}`).href || process.argv[1]?.endsWith('lint-operating-policy.mjs'); } catch { return false; }
}

if (isMain()) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const root = rootIdx !== -1 && args[rootIdx + 1] ? resolve(args[rootIdx + 1]) : process.cwd();
  const writeMode = args.includes('--write');

  if (writeMode) {
    const { written } = writeHostBlocks(root);
    for (const f of written) console.log(`[operating-policy] host block synced from canonical → ${f}`);
    if (written.length === 0) console.log('[operating-policy] host blocks already in sync — nothing written.');
  }

  const result = checkOperatingPolicy(root);
  if (result.digest) console.log(`[operating-policy] canonical policy digest sha256=${result.digest}`);
  if (result.ok) {
    console.log('[operating-policy] OK — host projections in parity; capsule hygiene clean.');
    process.exit(0);
  }
  for (const p of result.problems) console.error(`[operating-policy] ✗ ${p.code} ${p.file} — ${p.detail}`);
  process.exit(1);
}
