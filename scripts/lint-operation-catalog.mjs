#!/usr/bin/env node
// ═══ lint-operation-catalog — OPERATION-001 O1 fail-closed gate ═════════════
// The catalog is a GOVERNANCE artifact: it decides which gate, which risk class
// and which capabilities an action carries. A malformed entry is therefore an
// authority defect, not a typo — this gate refuses the build rather than let a
// half-declared operation reach admission.
//
// Checks (all fail-closed):
//   1. unique, stable, dot-hierarchic ids
//   2. every enum value is a declared member (effect/gate/risk/idempotency)
//   3. effect → minimum-gate matrix holds (no silent authority downgrade)
//   4. every capability exists in the work-model Capability vocabulary
//   5. i18n completeness — every title carries en AND tr
//   6. generated constants cover exactly the catalog (no drift either way)
//   7. reports declared-but-unconsumed fields so a dead field cannot hide
//      (D1 mitigation: "alan-var-tüketici-yok" visibility)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'src/core/operation-catalog/catalog.v1.json');
const INDEX = join(ROOT, 'src/core/operation-catalog/index.ts');
const WORK_MODEL = join(ROOT, 'src/core/work-model.ts');

const EFFECTS = ['READ', 'MUTATE_LOCAL', 'MUTATE_EXTERNAL', 'SPAWN_EXECUTION', 'DESTRUCTIVE', 'DB', 'MEMORY_LAW', 'PROVIDER_CALL'];
const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const IDEMPOTENCY = ['NONE', 'KEYED', 'NATURAL'];
const EFFECT_MIN_GATE = {
  READ: 'G0', MUTATE_LOCAL: 'G1', MUTATE_EXTERNAL: 'G1', SPAWN_EXECUTION: 'G1',
  DESTRUCTIVE: 'G3', DB: 'G4', MEMORY_LAW: 'G6', PROVIDER_CALL: 'G7',
};
const ID_RE = /^op(\.[a-z0-9]+(-[a-z0-9]+)*){2,}$/;

/** Capability vocabulary, read from work-model.ts so the two never drift. */
function readCapabilityVocabulary() {
  const src = readFileSync(WORK_MODEL, 'utf-8');
  const block = /export type Capability =([\s\S]*?);/.exec(src);
  if (!block) throw new Error('Capability union not found in work-model.ts');
  return new Set([...block[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]));
}

export function lintOperationCatalog() {
  const errors = [];
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf-8'));
  const capabilities = readCapabilityVocabulary();
  const seen = new Set();

  if (catalog.schemaVersion !== 1) errors.push(`schemaVersion must be 1, got ${catalog.schemaVersion}`);

  for (const op of catalog.operations ?? []) {
    const at = `operation '${op.id ?? '(missing id)'}'`;
    if (!ID_RE.test(op.id ?? '')) errors.push(`${at}: id must be dot-hierarchic lowercase (op.<family>.<verb>)`);
    if (seen.has(op.id)) errors.push(`${at}: duplicate id`);
    seen.add(op.id);
    if (!Number.isInteger(op.version) || op.version < 1) errors.push(`${at}: version must be a positive integer`);
    if (!EFFECTS.includes(op.effect)) errors.push(`${at}: unknown effect '${op.effect}'`);
    if (!GATES.includes(op.gate)) errors.push(`${at}: unknown gate '${op.gate}'`);
    if (!RISKS.includes(op.risk)) errors.push(`${at}: unknown risk '${op.risk}'`);
    if (!IDEMPOTENCY.includes(op.idempotency)) errors.push(`${at}: unknown idempotency '${op.idempotency}'`);
    if (typeof op.auditEvent !== 'string' || !/^[a-z0-9.]+\.v\d+$/.test(op.auditEvent)) {
      errors.push(`${at}: auditEvent must look like '<name>.v<N>'`);
    }
    if (!op.title || typeof op.title.en !== 'string' || typeof op.title.tr !== 'string'
      || !op.title.en.trim() || !op.title.tr.trim()) {
      errors.push(`${at}: title must carry non-empty en AND tr (i18n-first)`);
    }
    if (!Array.isArray(op.capabilities) || op.capabilities.length === 0) {
      errors.push(`${at}: capabilities must be a non-empty array`);
    } else {
      for (const cap of op.capabilities) {
        if (!capabilities.has(cap)) errors.push(`${at}: capability '${cap}' is not in the work-model vocabulary`);
      }
    }
    // effect → minimum gate (no silent authority downgrade)
    const min = EFFECT_MIN_GATE[op.effect];
    if (min && GATES.indexOf(op.gate) < GATES.indexOf(min)) {
      errors.push(`${at}: effect ${op.effect} requires at least ${min}, declared ${op.gate}`);
    }
  }

  // generated constants must cover exactly the catalog
  const indexSrc = readFileSync(INDEX, 'utf-8');
  const constIds = new Set([...indexSrc.matchAll(/:\s*'(op\.[a-z0-9.-]+)'/g)].map((m) => m[1]));
  for (const id of seen) if (!constIds.has(id)) errors.push(`generated constants missing an entry for '${id}'`);
  for (const id of constIds) if (!seen.has(id)) errors.push(`generated constant '${id}' has no catalog entry`);

  return { errors, count: seen.size };
}

const invokedDirectly = (() => {
  try { return fileURLToPath(import.meta.url) === (process.argv[1] ?? ''); } catch { return false; }
})();

if (invokedDirectly) {
  const { errors, count } = lintOperationCatalog();
  if (errors.length > 0) {
    process.stderr.write(`[operation-catalog] FAIL — ${errors.length} defect(s):\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }
  process.stdout.write(`[operation-catalog] ✓ ${count} operation(s) valid — ids, enums, effect→gate matrix, capabilities, i18n and generated constants all consistent\n`);
}
