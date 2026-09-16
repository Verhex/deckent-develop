// scripts/closure-ledger/project.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Non-authoritative projection producer for the Closure OS sidecar ledger
// (§12.1 rev-2 projection semantics). Applies owner-decided events (in seq order,
// honoring supersede/revoke) over the MASTER active projection to produce four
// read-only views: Active · Born · Closure-Health · Level×Lane.
//
// Authority split: MASTER = work identity/state. Sidecar ledger = Level×Lane +
// admission + priority-decision authority. These views are PROJECTION, never a
// source of truth. A row whose events conflict / drift / reference an unknown row
// is emitted as a typed HOLD (never silently skipped or defaulted).
//
// The ledger is validated by scripts/lint-closure-dispositions.mjs BEFORE
// projection; this module assumes a gate-passing ledger and re-reduces with the
// same effectiveEvents() helper (imported, not duplicated).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync, openSync, fsyncSync, closeSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveEvents, runGate, loadBatchManifests, loadBatchSnapshots, resolveTrustAnchors, parseLedger } from '../lint-closure-dispositions.mjs';
import { SCHEMA, digestOf, computeBatchManifestDigest } from './canonical.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER = join(ROOT, 'docs/governance/closure-dispositions.jsonl');
const RECEIPTS = join(ROOT, 'docs/governance/closure-dispositions.receipts');
const BATCHES = join(ROOT, 'docs/governance/closure-batches');
const TRUST_ANCHORS = join(ROOT, 'docs/governance/closure-trust-anchors.json');
const MASTER_JSON = join(ROOT, 'docs/generated/master-plan-active.json');
const PROJ_DIR = join(ROOT, 'docs/governance/closure-projections');
const VIEW_FILES = { levelLane: 'level-lane.json', active: 'active.json', born: 'born.json', closureHealth: 'closure-health.json' };

const LEVELS = SCHEMA.levels.values;
const LANE_COLS = [...SCHEMA.lanes.values, SCHEMA.lanes.holdState];
// only discovery / future-deferred are promotable (→ admitted-parked); duplicate-
// superseded-disposed is a terminal disposed state and can NEVER be promoted.
const PROMOTABLE = new Set(['discovery', 'future-deferred']);

/** Reduce ledger events → per-row current disposition. Returns { rows, holds }. */
export function reduce(events) {
  const rows = new Map(); // workId → { level?, lane?, priority?, admission?, promoted? , holds:[] }
  const get = (id) => { if (!rows.has(id)) rows.set(id, { workId: id, holds: [] }); return rows.get(id); };
  for (const e of effectiveEvents(events)) {
    const r = get(e.rowRef.workId);
    const d = e.decision;
    if (d.kind === 'level-lane-disposition') { r.level = d.level; r.lane = d.lane; r.ruleId = d.ruleId; r.confidence = d.confidence; }
    else if (d.kind === 'priority-retriage') r.priority = d.toPriority;
    else if (d.kind === 'admission') {
      r.admission = d.disposition;
      r.lifecycle = PROMOTABLE.has(d.disposition) ? 'admitted-parked'
        : d.disposition === 'hold' ? 'admitted-hold'
          : d.disposition === 'duplicate-superseded-disposed' ? 'admitted-disposed'
            : 'admitted-committed';
    }
    else if (d.kind === 'born-promotion') r.lifecycle = 'promoted-committed-outcome';
  }
  return rows;
}

/** Level×Lane view — authoritative matrix from ledger classifications. Rows with
 *  no classification event are counted as 'unclassified' (a typed HOLD column). */
export function levelLaneView(events, masterActive) {
  const reduced = reduce(events);
  const matrix = {}; for (const lv of [...LEVELS, 'unclassified']) { matrix[lv] = {}; for (const ln of [...LANE_COLS, 'unclassified']) matrix[lv][ln] = 0; }
  const holds = [];
  for (const row of masterActive.workItems) {
    const r = reduced.get(row.id);
    const lv = r?.level ?? 'unclassified';
    const ln = r?.lane ?? 'unclassified';
    if (lv === 'check-proof' && ln !== 'proof') { holds.push({ workId: row.id, code: 'CHECKPROOF_INVARIANT' }); continue; }
    matrix[lv][ln] += 1;
  }
  return { matrix, holds, classified: reduced.size, total: masterActive.workItems.length };
}

/** Active view — every active row with its effective disposition (or unclassified). */
export function activeView(events, masterActive) {
  const reduced = reduce(events);
  return masterActive.workItems.map((row) => {
    const r = reduced.get(row.id) || {};
    return {
      workId: row.id, program: row.program, state: row.state,
      priority: r.priority ?? row.priority, priorityFromLedger: r.priority !== undefined,
      level: r.level ?? null, lane: r.lane ?? null, classified: r.level !== undefined,
    };
  });
}

/** Born view — rows with an admission/promotion lifecycle recorded. Physical rows
 *  stay in place; this only reflects lifecycle state (no move/deletion). */
export function bornView(events) {
  const reduced = reduce(events);
  const born = [];
  for (const r of reduced.values()) if (r.admission !== undefined || r.lifecycle !== undefined) born.push({ workId: r.workId, admission: r.admission ?? null, lifecycle: r.lifecycle ?? null });
  return born;
}

/** Closure-Health view — aggregate measurement (non-authoritative). */
export function closureHealthView(events, masterActive) {
  const active = masterActive.workItems;
  const byState = {}, byPriority = {};
  for (const r of active) { byState[r.state] = (byState[r.state] || 0) + 1; byPriority[r.priority] = (byPriority[r.priority] || 0) + 1; }
  const reduced = reduce(events);
  const classified = [...reduced.values()].filter((r) => r.level !== undefined).length;
  return {
    totalActive: active.length,
    byState, byPriority,
    ledgerClassified: classified,
    classificationCoverage: active.length ? Math.round((100 * classified) / active.length) : 0,
    ledgerEvents: events.length,
  };
}

/** Produce all four views. */
export function project(events, masterActive) {
  return {
    levelLane: levelLaneView(events, masterActive),
    active: activeView(events, masterActive),
    born: bornView(events),
    closureHealth: closureHealthView(events, masterActive),
  };
}

// ── Self-check (asserted through the CLI subprocess by tests/governance; see the
//    gate for why the mechanism is not unit-tested by import). Events need no
//    valid digest here — projection reduction reads only seq/rowRef/decision. ──
export function runSelfCheck() {
  const failures = []; let n = 0;
  const ok = (c, l) => { n += 1; if (!c) failures.push(l); };
  const ev = (seq, workId, decision) => ({ seq, rowRef: { workId }, decision });
  const master = { workItems: [
    { id: 'ROW-A', program: 'KERNEL', state: 'OPEN', priority: 'P0' },
    { id: 'ROW-B', program: 'TRUTH', state: 'OPEN', priority: 'P1' },
    { id: 'ROW-C', program: 'ASSURANCE', state: 'OPEN', priority: 'P2' },
  ] };
  const full = [
    ev(1, 'ROW-A', { kind: 'level-lane-disposition', level: 'task', lane: 'runtime' }),
    ev(2, 'ROW-B', { kind: 'level-lane-disposition', level: 'outcome', lane: 'contract' }),
    ev(3, 'ROW-C', { kind: 'level-lane-disposition', level: 'check-proof', lane: 'proof' }),
  ];
  const r = reduce(full);
  ok(r.get('ROW-A').level === 'task', 'reduce: level');
  ok(r.get('ROW-C').lane === 'proof', 'reduce: lane');
  const v = levelLaneView(full, master);
  ok(v.classified === 3, 'levelLane: classified count');
  ok(v.matrix['check-proof'].proof === 1, 'levelLane: check-proof→proof');
  const partial = [ev(1, 'ROW-A', { kind: 'level-lane-disposition', level: 'task', lane: 'runtime' })];
  const p = project(partial, master);
  ok(p.levelLane.matrix.unclassified.unclassified === 2, 'project: unclassified bucket');
  ok(p.closureHealth.classificationCoverage === 33, 'project: coverage %');
  ok(p.active.find((x) => x.workId === 'ROW-B').classified === false, 'project: active unclassified');
  const bornEv = [ev(1, 'ROW-A', { kind: 'admission', disposition: 'discovery' }), ev(2, 'ROW-A', { kind: 'born-promotion', promotedTo: 'committed-outcome' })];
  ok(project(bornEv, master).born.find((x) => x.workId === 'ROW-A').lifecycle === 'promoted-committed-outcome', 'project: born lifecycle');
  const sup = [ev(1, 'ROW-A', { kind: 'level-lane-disposition', level: 'task', lane: 'runtime' }), ev(2, 'ROW-A', { kind: 'supersede', targetSeq: 1, reason: 'fix' }), ev(3, 'ROW-A', { kind: 'level-lane-disposition', level: 'outcome', lane: 'contract' })];
  ok(reduce(sup).get('ROW-A').level === 'outcome', 'reduce: supersede → latest wins');

  // ── B2 transactional bundle: failure-injection matrix (tmpdir, hermetic) ──
  {
    const dir = mkdtempSync(join(tmpdir(), 'closure-proj-'));
    writeBundle(dir, { levelLane: '{"v":1}\n', active: '[]\n', born: '[]\n', closureHealth: '{}\n' });
    ok(readCurrentBundle(dir)?.valid === true, 'bundle: first write → current resolves + 4 digests verify');
    const before = readFileSync(join(dir, 'current.json'), 'utf8');
    for (const stage of ['views', 'manifest', 'pre-swap', 'swap']) {
      const r2 = { levelLane: '{"v":2}\n', active: '[]\n', born: '[]\n', closureHealth: '{}\n' };
      let threw = false;
      try { writeBundle(dir, r2, stage === 'swap' ? { renamer: () => { throw new Error('inject swap'); } } : { injectAfter: stage }); } catch { threw = true; }
      ok(threw, `bundle: injection@${stage} throws`);
      ok(readFileSync(join(dir, 'current.json'), 'utf8') === before, `bundle: injection@${stage} → old current.json byte-identical (no partial-current)`);
      ok(readCurrentBundle(dir)?.valid === true, `bundle: injection@${stage} → old bundle still verifies`);
    }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }

  if (failures.length) { for (const f of failures) console.log(`[closure-project:self-check] FAIL ${f}`); console.log(`[closure-project:self-check] ${n - failures.length}/${n} passed, ${failures.length} FAILED`); return 1; }
  console.log(`[closure-project:self-check] OK — ${n}/${n} assertions passed`);
  return 0;
}

// ── Projector CLI (req-5): --dry-run manifest · --check / --write (atomic, gate-gated) ──
function stable(v) {
  return JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.keys(val).sort().reduce((o, kk) => { o[kk] = val[kk]; return o; }, {}) : val), 2) + '\n';
}

/** Dry-run: the deterministic unsigned batch manifest digest + interval for a set
 *  of events (what the phase-5 approval request binds FIRST). Writes nothing. */
export function dryRunManifest(events) {
  const seqs = events.map((e) => e.seq);
  return { eventCount: events.length, seqIntervalStart: seqs.length ? Math.min(...seqs) : null, seqIntervalEnd: seqs.length ? Math.max(...seqs) : null, unsignedManifestDigest: computeBatchManifestDigest(events) };
}

function loadInputs() {
  const ledgerText = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : '';
  let master = { workItems: [] }, registry = null, masterSourceDigest = null;
  try { master = JSON.parse(readFileSync(MASTER_JSON, 'utf8')); registry = master.identityRegistry; masterSourceDigest = master.sourceDigest?.value; } catch { /* master unavailable → gate HOLDs */ }
  const { manifests, problems: receiptProblems } = loadBatchManifests(RECEIPTS);
  const batchSnapshots = loadBatchSnapshots(BATCHES);
  return { ledgerText, master, registry, masterSourceDigest, manifests, receiptProblems, batchSnapshots };
}

/** Reviewed-parent trust anchors — resolved ONLY when a non-empty ledger actually
 *  needs the gate (git work stays off the empty/dry-run paths). */
function resolveProjectorTrust() {
  const gitRunner = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const workingTreeText = existsSync(TRUST_ANCHORS) ? readFileSync(TRUST_ANCHORS, 'utf8') : '';
  return resolveTrustAnchors({ gitRunner, workingTreeText });
}

function renderViews(events, master) {
  const v = project(events, master);
  return { levelLane: stable(v.levelLane), active: stable(v.active), born: stable(v.born), closureHealth: stable(v.closureHealth) };
}

function fsyncFile(p) { const fd = openSync(p, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function bundleManifestOf(rendered) {
  const views = {}; for (const [k, file] of Object.entries(VIEW_FILES)) views[file] = digestOf(rendered[k]);
  const manifest = { schemaVersion: 1, views };
  return { manifest, bundleId: digestOf(stable(manifest)) };
}

/** Transactional projection write (Codex B2). Not four renames — an IMMUTABLE,
 *  versioned bundle whose ONLY commit is a single small pointer swap. Steps: write
 *  4 views + a bundle manifest into an immutable bundle dir, fsync each, then
 *  atomically rename ONE current.json pointer. Cross-platform, symlink-free.
 *  opts.injectAfter ('views'|'manifest'|'pre-swap') or opts.renamer (throwing)
 *  exercise per-stage failure; the previous current.json survives byte-identical. */
export function writeBundle(projDir, rendered, opts = {}) {
  const { manifest, bundleId } = bundleManifestOf(rendered);
  const bundleDir = join(projDir, 'bundles', bundleId);
  mkdirSync(bundleDir, { recursive: true });
  for (const [k, file] of Object.entries(VIEW_FILES)) { const p = join(bundleDir, file); writeFileSync(p, rendered[k], 'utf8'); fsyncFile(p); }
  if (opts.injectAfter === 'views') throw new Error('inject: after views');
  const mPath = join(bundleDir, 'bundle-manifest.json');
  writeFileSync(mPath, JSON.stringify({ bundleId, ...manifest }, null, 2) + '\n', 'utf8'); fsyncFile(mPath);
  if (opts.injectAfter === 'manifest') throw new Error('inject: after bundle manifest');
  const tmp = join(projDir, '.current.json.tmp');
  writeFileSync(tmp, JSON.stringify({ schemaVersion: 1, bundleId, views: manifest.views }, null, 2) + '\n', 'utf8'); fsyncFile(tmp);
  if (opts.injectAfter === 'pre-swap') { try { rmSync(tmp, { force: true }); } catch { /* */ } throw new Error('inject: pre-swap'); }
  (opts.renamer || renameSync)(tmp, join(projDir, 'current.json')); // the single atomic commit
  return { bundleId };
}

/** Resolve the current bundle + verify its four content digests. null → none. */
export function readCurrentBundle(projDir) {
  const curPath = join(projDir, 'current.json');
  if (!existsSync(curPath)) return null;
  let cur; try { cur = JSON.parse(readFileSync(curPath, 'utf8')); } catch { return { cur: null, valid: false }; }
  const bundleDir = join(projDir, 'bundles', cur.bundleId);
  let valid = true;
  for (const [, file] of Object.entries(VIEW_FILES)) { const p = join(bundleDir, file); const d = existsSync(p) ? digestOf(readFileSync(p, 'utf8')) : null; if (d !== cur.views?.[file]) valid = false; }
  return { cur, bundleDir, valid };
}

function runProjectorCli() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) process.exit(runSelfCheck());
  const { ledgerText, master, registry, masterSourceDigest, manifests, receiptProblems, batchSnapshots } = loadInputs();
  const { events } = parseLedger(ledgerText);
  if (args.includes('--dry-run')) { console.log(JSON.stringify(dryRunManifest(events))); process.exit(0); }
  if (events.length === 0) { console.log('[closure-project] no ledger events — nothing to project (OK)'); process.exit(0); }
  // reviewed-parent trust anchors resolved ONLY now (a non-empty ledger needs the gate)
  const { anchors: trustAnchors, problems: trustAnchorProblems } = resolveProjectorTrust();
  // projections are produced ONLY from a gate-PASSING ledger (no projection on HOLD/error)
  const res = runGate({ ledgerText, baseline: null, registry, masterSourceDigest, batchManifests: manifests, verifyAuthority: true, trustAnchors, batchSnapshots, trustAnchorProblems, receiptProblems });
  if (!res.ok) {
    console.log(`[closure-project] ledger gate not clean (${res.errors.length} error, ${res.holds.length} hold) → HOLD, no projection written`);
    for (const h of res.holds) console.log(`  HOLD ${h.code}`);
    for (const er of res.errors) console.log(`  ERROR ${er.code}`);
    process.exit(1);
  }
  const rendered = renderViews(events, master);
  if (args.includes('--write')) { const { bundleId } = writeBundle(PROJ_DIR, rendered); console.log(`[closure-project] wrote projection bundle ${bundleId.slice(0, 12)}… → ${join(PROJ_DIR, 'current.json')}`); process.exit(0); }
  if (args.includes('--check')) {
    const cur = readCurrentBundle(PROJ_DIR);
    if (!cur) { console.log('[closure-project] --check DRIFT: no current projection bundle (run --write)'); process.exit(1); }
    if (!cur.valid) { console.log('[closure-project] --check: current bundle content digests do NOT verify'); process.exit(1); }
    let drift = false;
    for (const [k, file] of Object.entries(VIEW_FILES)) if (digestOf(rendered[k]) !== cur.cur.views[file]) { console.log(`[closure-project] --check DRIFT: ${file}`); drift = true; }
    if (drift) process.exit(1);
    console.log('[closure-project] --check OK — current bundle matches generator; 4 content digests verify'); process.exit(0);
  }
  console.log('[closure-project] usage: --self-check | --dry-run | --check | --write'); process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) runProjectorCli();
