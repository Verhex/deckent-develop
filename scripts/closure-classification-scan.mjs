#!/usr/bin/env node
// closure-classification-scan.mjs — Proposal v2.1
// ─────────────────────────────────────────────────────────────────────────────
// Read-only machine scan for the Closure OS Level × Lane classification round
// (CLOSURE-OS-PRODUCT-TRANSITION-BRIEF §3, §3.4, §10 adım-4; scope item 5).
//
// v2.1 (Codex final disposition, 2026-08-14). Corrections applied:
//  • Level precedence: owner-override → declared-program (ASSURANCE) → structural
//    topology → typed HOLD. ID-regex is NOT a classification authority.
//  • Invariant: level=check-proof ⇒ lane=proof (gate fails otherwise).
//  • Confidence: HIGH only for owner-declared per-row overrides; program→lane and
//    structural rules are MEDIUM; unresolved → LOW/HOLD.
//  • Priority: 0 changes this phase. P0 reported in 3 honest categories
//    (explicit-closure-reference / proposed-Level-only / semantic-owner-preserved).
//    Never "N closure-proven".
//  • Structural defaults (bucket→outcome, children→package, leaf→task) ratified;
//    the EXC-* exception codes are retired.
//  • One canonical scan result feeds the generated doc AND the console summary —
//    no hand-written matrix anywhere (report↔disk parity is a phase-4 test).
//
// Nothing here writes the ledger or mutates MASTER.
//
// Usage: node scripts/closure-classification-scan.mjs [--write]
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = join(ROOT, 'src/core/closure-classification-schema.json');
const MASTER_JSON = join(ROOT, 'docs/generated/master-plan-active.json');
const ARCHIVE_PLAN = join(ROOT, 'docs/archive/MASTER-PLAN-archived-2026-06-29.md');
const OUT_DOC = join(ROOT, 'docs/governance/closure-classification-owner-proposal.md');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const master = JSON.parse(readFileSync(MASTER_JSON, 'utf8'));
const active = master.workItems;
const registry = master.identityRegistry;
const regById = new Map(registry.map((r) => [r.id, r]));
const activeById = new Map(active.map((r) => [r.id, r]));

const LEVELS = schema.levels.values;
const LANES = schema.lanes.values;
const HOLD_LANE = schema.lanes.holdState;
const LANE_COLS = [...LANES, HOLD_LANE];
const COMMITTED = schema.admissionDispositions.committedMarker;
const OV = schema.ownerOverrides;
const CHECKPROOF_PROOF = schema.invariants.checkProofImpliesProofLane === true;

const isBucket = (p) => /^P\d+$/.test(String(p || ''));

const PROGRAM_LANE = {
  TRUTH: 'contract', AUTHORITY: 'contract', PAEP: 'contract', PROMPT: 'contract',
  ROUTING: 'contract', EVAL: 'contract', COST: 'contract', DATA: 'contract',
  SECURITY: 'contract', LEARNING: 'contract', EVOLUTION: 'contract',
  KERNEL: 'runtime', PROVIDER: 'runtime', CODEX: 'runtime', OBS: 'runtime',
  OPS: 'runtime', API: 'runtime', CONNECTOR: 'runtime', RESILIENCE: 'runtime',
  DURABILITY: 'runtime', SCALE: 'runtime', ENTERPRISE: 'runtime', TOOL: 'runtime',
  DESKTOP: 'desktop', DASHBOARD: 'desktop',
  TERMINAL: 'terminal', SURFACE: 'terminal', ONBOARDING: 'terminal',
  ASSURANCE: 'proof', XPLAT: 'proof',
};
const CROSS_CUTTING = new Set(['PRODUCT', 'RELEASE', 'DOCS', 'REPO', 'ECOSYSTEM']);
const CROSS_RULES = {
  DOCS: [
    { re: /release|attestation/i, lane: 'proof', ruleId: 'LANE-docs-release-evidence' },
    { re: /truth|reference|guide|architecture|catalog|documentation|docs/i, lane: 'contract', ruleId: 'LANE-docs-truth' },
  ],
  ECOSYSTEM: [
    { re: /runtime|adapter|integration|hub|server|ingest|sync|interop|plugin-package/i, lane: 'runtime', ruleId: 'LANE-eco-runtime-integration' },
    { re: /catalog|protocol|authority|governance|standard|canonical|ecosystem|a2a/i, lane: 'contract', ruleId: 'LANE-eco-catalog-contract' },
  ],
  PRODUCT: [
    { re: /parity|proof|acceptance|certif|flagship/i, lane: 'proof', ruleId: 'LANE-prod-proof' },
    { multiSurface: true, lane: HOLD_LANE, ruleId: 'LANE-prod-multi-surface' },
    { re: /\bdesktop\b/i, lane: 'desktop', ruleId: 'LANE-prod-desktop' },
    { re: /\bterminal\b/i, lane: 'terminal', ruleId: 'LANE-prod-terminal' },
    { re: /contract|receipt|northstar|metrics|coopetition/i, lane: 'contract', ruleId: 'LANE-prod-contract' },
    { re: /service|run-inspector|\brun\b|management|conversation|hub|server|inspector|mcp/i, lane: 'runtime', ruleId: 'LANE-prod-runtime' },
  ],
  RELEASE: [
    { re: /validate|attestation|soak|\bgate\b/i, lane: 'proof', ruleId: 'LANE-rel-validation' },
    { re: /packaging|publish|channel|npm/i, lane: 'runtime', ruleId: 'LANE-rel-publish' },
    { re: /policy/i, lane: 'contract', ruleId: 'LANE-rel-policy' },
  ],
  REPO: [
    { re: /execute|migration|cutover/i, lane: 'runtime', ruleId: 'LANE-repo-migration-exec' },
    { re: /governance|contract|rebaseline/i, lane: 'contract', ruleId: 'LANE-repo-governance' },
  ],
};

// ── Level: owner-override → declared-program → structural topology ──
function classifyLevel(r) {
  if (OV.level[r.id]) return { value: OV.level[r.id], ruleId: 'LVL-owner-override', confidence: 'high' };
  if (r.program === 'ASSURANCE') return { value: 'check-proof', ruleId: 'LVL-assurance-program', confidence: 'medium' };
  if (isBucket(r.parent)) return { value: 'outcome', ruleId: 'LVL-top-bucket', confidence: 'medium' };
  if ((r.children || []).length > 0) return { value: 'package', ruleId: 'LVL-child-with-children', confidence: 'medium' };
  return { value: 'task', ruleId: 'LVL-child-leaf', confidence: 'medium' };
}

// ── Lane: owner-override → check-proof invariant → program-map → cross-cut → HOLD ──
function classifyLane(r, levelValue, conflicts) {
  let lane;
  if (OV.lane[r.id]) lane = { value: OV.lane[r.id], ruleId: 'LANE-owner-override', confidence: 'high' };
  else if (levelValue === 'check-proof' && CHECKPROOF_PROOF) lane = { value: 'proof', ruleId: 'LANE-checkproof-invariant', confidence: 'medium' };
  else if (!CROSS_CUTTING.has(r.program) && PROGRAM_LANE[r.program]) lane = { value: PROGRAM_LANE[r.program], ruleId: 'LANE-program-map', confidence: 'medium' };
  else if (CROSS_CUTTING.has(r.program)) {
    const text = `${r.id} ${r.outcome || ''}`;
    const both = /\bdesktop\b/i.test(text) && /\bterminal\b/i.test(text);
    lane = { value: HOLD_LANE, ruleId: 'LANE-crosscut-unresolved', confidence: 'low' };
    for (const rule of CROSS_RULES[r.program] || []) {
      if (rule.multiSurface) { if (both) { lane = { value: rule.lane, ruleId: rule.ruleId, confidence: 'low' }; break; } continue; }
      if (rule.re.test(text)) { lane = { value: rule.lane, ruleId: rule.ruleId, confidence: 'medium' }; break; }
    }
  } else lane = { value: HOLD_LANE, ruleId: 'LANE-unmapped-program', confidence: 'low' };
  // enforce check-proof ⇒ proof (an override that violates it is a recorded conflict)
  if (CHECKPROOF_PROOF && levelValue === 'check-proof' && lane.value !== 'proof') {
    conflicts.push({ id: r.id, was: lane.value, ruleId: lane.ruleId });
    lane = { value: 'proof', ruleId: 'LANE-checkproof-invariant-forced', confidence: lane.confidence };
  }
  return lane;
}

const invariantConflicts = [];
const scan = active.map((r) => {
  const level = classifyLevel(r);
  const lane = classifyLane(r, level.value, invariantConflicts);
  return {
    id: r.id, order: r.order, program: r.program, parent: r.parent, state: r.state,
    priority: r.priority, outcome: r.outcome, level, lane, admission: COMMITTED,
    children: (r.children || []).length, dependents: (r.dependents || []).length,
    dependsOn: r.dependsOn || [], closureBlockedBy: r.closureBlockedBy || [],
  };
});

// ── closure-criticality evidence (computed AFTER overrides) ──
const closureRefs = new Set();
for (const r of active) for (const d of (r.closureBlockedBy || [])) closureRefs.add(d);
const outcomeDeps = new Set();
for (const s of scan) if (['outcome', 'package'].includes(s.level.value)) for (const d of s.dependsOn) outcomeDeps.add(d);
const explicitCritical = (s) => closureRefs.has(s.id) || outcomeDeps.has(s.id);
const preserved = new Set(OV.priorityPreserved || []);

// ── matrix ──
const matrix = {};
for (const lv of LEVELS) { matrix[lv] = {}; for (const ln of LANE_COLS) matrix[lv][ln] = 0; }
for (const s of scan) matrix[s.level.value][s.lane.value] += 1;
// invariant self-check on the produced matrix: check-proof only in proof
const invariantOk = LANE_COLS.filter((ln) => ln !== 'proof').every((ln) => matrix['check-proof'][ln] === 0);

// ── ruleId/confidence distribution ──
const dist = { level: { rule: {}, conf: {} }, lane: { rule: {}, conf: {} } };
for (const s of scan) {
  dist.level.rule[s.level.ruleId] = (dist.level.rule[s.level.ruleId] || 0) + 1;
  dist.level.conf[s.level.confidence] = (dist.level.conf[s.level.confidence] || 0) + 1;
  dist.lane.rule[s.lane.ruleId] = (dist.lane.rule[s.lane.ruleId] || 0) + 1;
  dist.lane.conf[s.lane.confidence] = (dist.lane.conf[s.lane.confidence] || 0) + 1;
}

// ── priority: 3 honest categories (0 changes) ──
const p0 = scan.filter((s) => s.priority === 'P0');
const p0Explicit = p0.filter((s) => explicitCritical(s));
const p0Semantic = p0.filter((s) => !explicitCritical(s) && preserved.has(s.id));
const p0ByLevel = p0.filter((s) => !explicitCritical(s) && !preserved.has(s.id) && ['outcome', 'package'].includes(s.level.value));
const p0Uncovered = p0.filter((s) => !explicitCritical(s) && !preserved.has(s.id) && !['outcome', 'package'].includes(s.level.value));

// ── lane HOLD ──
const laneHold = scan.filter((s) => s.lane.value === HOLD_LANE);

// ── dangling reconciliation vs full 491 registry ──
let archiveIds = new Set();
try { const a = readFileSync(ARCHIVE_PLAN, 'utf8'); for (const m of a.matchAll(/^\|\s*`?([A-Z][A-Z0-9-]+-\d{3})`?\s*\|/gm)) archiveIds.add(m[1]); } catch { archiveIds = null; }
const dang = { terminalDONE: new Set(), archived: new Set(), missing: new Set() };
for (const r of active) {
  const refs = []; if (r.parent && !isBucket(r.parent)) refs.push(r.parent); for (const d of (r.dependsOn || [])) refs.push(d);
  for (const ref of refs) {
    if (activeById.has(ref)) continue;
    if (regById.has(ref)) dang.terminalDONE.add(ref);
    else if (archiveIds && archiveIds.has(ref)) dang.archived.add(ref);
    else dang.missing.add(ref);
  }
}

// ── findings ──
const findings = [
  { code: 'F-P0-INFLATION', status: 'acknowledged / open measurement', text: `${p0.length}/${scan.length} active rows are P0. Priority changes this phase = 0. Category split: ${p0Explicit.length} carry an explicit closure reference (closureBlockedBy / outcome-dependency); ${p0ByLevel.length} are critical only by their proposed outcome/package Level; ${p0Semantic.length} are preserved at P0 by semantic owner decision (${[...preserved].join(', ')}); ${p0Uncovered.length} carry none of these. This stays an OPEN measurement finding — NOT a demotion.` },
  { code: 'F-DANGLING-REF', status: 'resolved', text: `Full 491-registry reconciliation: terminal-DONE=${dang.terminalDONE.size} (valid); superseded/archived=${archiveIds ? dang.archived.size : 'archive-not-loaded→HOLD'}; not-in-registry (typo/missing)=${dang.missing.size}. ${dang.missing.size === 0 ? 'No missing references.' : ''}` },
];

// ── render ──
function pct(n, d) { return `${Math.round((100 * n) / d)}%`; }
function kv(o) { return Object.entries(o).map(([k, v]) => `${k}:${v}`).join(' · '); }
function renderDoc() {
  const L = [];
  L.push('<!-- GENERATED by scripts/closure-classification-scan.mjs (Proposal v2.1) — do not hand-edit.');
  L.push('     DELETE-ON-CONSUME: delete once dispositions are ratified into docs/governance/closure-dispositions.jsonl (phase-4). -->');
  L.push('');
  L.push('# Closure OS — Level × Lane classification & re-triage: owner disposition proposal **v2.1**');
  L.push('');
  L.push('> Read-only, non-authoritative. Codex final disposition (2026-08-14): owner-declared semantics outrank topology; ID-regex is not a classification authority; `check-proof ⇒ proof`; priority changes this phase = 0.');
  L.push(`> Source: \`master-plan-active.json\` @ sourceDigest \`${master.sourceDigest.value.slice(0, 16)}…\` · registryIntegrity \`${master.registryIntegrity.value.slice(0, 16)}…\``);
  L.push(`> Enum + override SSOT: \`src/core/closure-classification-schema.json\` (schemaVersion ${schema.schemaVersion}). Rows scanned: ${scan.length} active.`);
  L.push(`> check-proof⇒proof invariant on this output: **${invariantOk ? 'HOLDS' : 'VIOLATED'}**. Override-vs-invariant conflicts: ${invariantConflicts.length}.`);
  L.push('');

  L.push('## 1. Level × Lane matrix (generated — never hand-written)');
  L.push('');
  L.push(`| Level \\ Lane | ${LANE_COLS.join(' | ')} | total |`);
  L.push(`|---|${LANE_COLS.map(() => '---:').join('|')}|---:|`);
  for (const lv of LEVELS) {
    const cells = LANE_COLS.map((ln) => matrix[lv][ln] || '·');
    L.push(`| **${lv}** | ${cells.join(' | ')} | ${LANE_COLS.reduce((a, ln) => a + matrix[lv][ln], 0)} |`);
  }
  L.push(`| **total** | ${LANE_COLS.map((ln) => LEVELS.reduce((a, lv) => a + matrix[lv][ln], 0)).join(' | ')} | ${scan.length} |`);
  L.push('');
  L.push(`\`check-proof\` rows are all in \`proof\` (invariant). \`${HOLD_LANE}\` = typed-HOLD lane state.`);
  L.push('');

  L.push('## 2. Priority — 3 honest categories (0 changes this phase)');
  L.push('');
  L.push(`Current: ${p0.length} P0 · ${scan.filter((s) => s.priority === 'P1').length} P1 · ${scan.filter((s) => s.priority === 'P2').length} P2. **No priority is changed in this phase.** Dependency-gating, BLOCKED state and fan-out were rejected as priority signals.`);
  L.push('');
  L.push('| category | P0 rows | meaning |');
  L.push('|---|--:|---|');
  L.push(`| explicit closure reference | ${p0Explicit.length} | appears in a closureBlockedBy or is depended-on by an outcome/package |`);
  L.push(`| proposed-Level only | ${p0ByLevel.length} | critical only because its proposed Level is outcome/package (no explicit closure ref) |`);
  L.push(`| semantic owner-preserved | ${p0Semantic.length} | kept P0 by owner decision: ${[...preserved].map((x) => `\`${x}\``).join(', ')} |`);
  if (p0Uncovered.length) L.push(`| uncovered | ${p0Uncovered.length} | ${p0Uncovered.map((s) => `\`${s.id}\``).join(', ')} |`);
  L.push('');
  L.push('**F-P0-INFLATION** stays an acknowledged/open measurement finding (§4). **L3** (priority-model change) is DEFERRED to a B16 strategic-vs-execution design question; no new priority namespace, no bulk inheritance.');
  L.push('');

  L.push('## 3. Lane resolution & HOLDs');
  L.push('');
  L.push(`Owner lane overrides applied (${Object.keys(OV.lane).length}). ${laneHold.length} rows remain \`${HOLD_LANE}\` (never guess-filled):`);
  L.push('');
  L.push('| Work ID | program | ruleId |');
  L.push('|---|---|---|');
  for (const s of laneHold.slice().sort((a, b) => a.id.localeCompare(b.id))) L.push(`| \`${s.id}\` | ${s.program} | ${s.lane.ruleId} |`);
  if (!laneHold.length) L.push('| _(none)_ | | |');
  L.push('');

  L.push('## 4. Findings');
  L.push('');
  for (const f of findings) L.push(`- **${f.code}** _(${f.status})_ — ${f.text}`);
  L.push('');

  L.push('## 5. ruleId / confidence distribution');
  L.push('');
  L.push(`**Level** — conf: ${kv(dist.level.conf)}. Rules: ${kv(dist.level.rule)}`);
  L.push('');
  L.push(`**Lane** — conf: ${kv(dist.lane.conf)}. Rules: ${kv(dist.lane.rule)}`);
  L.push('');
  L.push(`HIGH is reserved for owner-declared per-row overrides (Codex §6). Program→lane and structural rules are MEDIUM; unresolved → LOW/HOLD. HIGH share: Level ${pct(dist.level.conf.high || 0, scan.length)}, Lane ${pct(dist.lane.conf.high || 0, scan.length)}.`);
  L.push('');

  L.push('## 6. Applied owner-override manifest + ratified structural defaults');
  L.push('');
  L.push(`ID-regex is retired as a classification authority. The structural defaults are ratified as-is (${kv(schema.invariants.structuralDefaultsRatified)}); the earlier EXC-* codes are retired. Owner-declared overrides (highest authority) applied:`);
  L.push('');
  L.push('| Work ID | Level override | Lane override |');
  L.push('|---|---|---|');
  const ovIds = [...new Set([...Object.keys(OV.level), ...Object.keys(OV.lane)])].sort();
  for (const id of ovIds) L.push(`| \`${id}\` | ${OV.level[id] || '—'} | ${OV.lane[id] || '—'} |`);
  L.push('');

  L.push('## 7. Admission / born-promotion lifecycle (ratified: separate sequential classes)');
  L.push('');
  L.push('| from | event | when | to |');
  L.push('|---|---|---|---|');
  for (const t of schema.decisionClasses.lifecycle.transitions) L.push(`| ${t.from} | \`${t.event}\` | ${t.when} | ${t.to} |`);
  L.push('');
  L.push(`**Invariant:** ${schema.decisionClasses.lifecycle.invariant}`);
  L.push('');

  L.push('## 8. Phase-4 exact ledger-mutation preview (NO write until authenticated owner receipt)');
  L.push('');
  L.push('```jsonc');
  L.push('{ "schemaVersion":1, "seq":<n>, "eventId":"…", "recordedAt":"<owner-batch-ts>",');
  L.push(`  "rowRef":{ "workId":"<id>", "rowDefinitionDigest":"<identityRegistry.definitionDigest>", "masterSourceDigest":"${master.sourceDigest.value.slice(0, 12)}…" },`);
  L.push('  "decision":{ "kind":"level-lane-disposition", "level":"<enum>", "lane":"<enum>", "ruleId":"<rule>", "confidence":"<h|m|l>" },');
  L.push('  "authorityProof":{ "ownerReceipt":"<authenticated durable receipt ref>" }, "previousEventDigest":"…", "eventDigest":"…" }');
  L.push(`// priority-retriage events this phase: 0 (priority unchanged). lane-resolution candidates: ${laneHold.length} HOLD rows if owner assigns.`);
  L.push('// finding-ack: F-P0-INFLATION (open), F-DANGLING-REF (resolved).');
  L.push('```');
  L.push('');
  L.push('**MASTER cells changed this phase: NONE** (priority unchanged; Level/Lane live in the sidecar projection, not MASTER). **Owner-proof binding:** each event\'s `authorityProof.ownerReceipt` binds to the existing authenticated/durable receipt mechanism; this doc/chat is NOT actor-string authority; unresolved authority → typed HOLD, ledger unwritten, no fabricated receipt.');
  L.push('');

  L.push('## 9. Appendix — full per-row proposal');
  L.push('');
  L.push(`<details><summary>All ${scan.length} rows (Level · Lane · confidence · P0 category)</summary>`);
  L.push('');
  L.push('| Work ID | program | state | pri | level (conf) | lane (conf) | ov |');
  L.push('|---|---|---|---|---|---|---|');
  for (const s of scan.slice().sort((a, b) => a.order - b.order)) {
    const ov = (OV.level[s.id] || OV.lane[s.id]) ? '✱' : '';
    L.push(`| \`${s.id}\` | ${s.program} | ${s.state} | ${s.priority} | ${s.level.value} (${s.level.confidence[0]}) | ${s.lane.value} (${s.lane.confidence[0]}) | ${ov} |`);
  }
  L.push('');
  L.push('</details>');
  L.push('');
  return L.join('\n');
}

// Exports for the report↔disk parity test (Codex req): the generator is the ONE
// source of the doc; the test asserts the committed file equals renderDoc().
export { renderDoc, invariantOk, invariantConflicts };
export const OUTPUT_DOC_PATH = OUT_DOC;

function runCli() {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    // staleness gate: render in memory, compare to disk, write NOTHING (safe in tests)
    const fresh = renderDoc();
    let onDisk = '';
    try { onDisk = readFileSync(OUT_DOC, 'utf8'); } catch { onDisk = ''; }
    if (onDisk === fresh) { console.log('[closure-scan v2.1] --check OK — owner-proposal.md in sync with the generator'); process.exit(0); }
    console.log('[closure-scan v2.1] --check DRIFT — owner-proposal.md is stale vs the generator; run `--write`'); process.exit(1);
  }
  if (args.includes('--write')) {
    mkdirSync(dirname(OUT_DOC), { recursive: true });
    writeFileSync(OUT_DOC, renderDoc(), 'utf8');
    console.log(`[closure-scan v2.1] wrote ${OUT_DOC}`);
  }
  console.log(`[closure-scan v2.1] ${scan.length} rows @ ${master.sourceDigest.value.slice(0, 12)} | check-proof⇒proof: ${invariantOk ? 'HOLDS' : 'VIOLATED'} | conflicts: ${invariantConflicts.length}`);
  console.log(`[closure-scan v2.1] Level conf ${kv(dist.level.conf)} | Lane conf ${kv(dist.lane.conf)}`);
  console.log(`[closure-scan v2.1] matrix check-proof row: ${LANE_COLS.map((ln) => `${ln}:${matrix['check-proof'][ln]}`).filter((x) => !x.endsWith(':0')).join(' ')}`);
  console.log(`[closure-scan v2.1] P0=${p0.length} → explicit=${p0Explicit.length} byLevel=${p0ByLevel.length} semantic=${p0Semantic.length} uncovered=${p0Uncovered.length} | priority changes=0`);
  console.log(`[closure-scan v2.1] lane-HOLD=${laneHold.length} (${laneHold.map((s) => s.id).join(', ')})`);
  console.log(`[closure-scan v2.1] dangling: terminal=${dang.terminalDONE.size} archived=${archiveIds ? dang.archived.size : 'n/a'} missing=${dang.missing.size}`);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
